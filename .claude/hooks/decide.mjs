/**
 * What the PreToolUse guard decides. guard.mjs is the entry point that Claude
 * Code runs; this is everything it knows, kept apart so the tests can call it
 * directly. See guard.mjs for how a decision reaches Claude Code and why the
 * guard fails closed.
 *
 * `decide(input)` takes the hook input Claude Code sends and returns null (the
 * call goes ahead) or one decision:
 *
 *   deny   the call does not happen, and the reason goes back to the agent
 *   ask    the call waits for Joel's click
 *
 * ## Why it parses rather than greps
 *
 * The regex it replaces let `git push origin +main` and `git -C . push origin
 * main` through, and refused `git fetch origin main` for sitting in the same
 * command as a push. A push is decided by its refspecs, so this reads them: it
 * splits the command the way a shell would (quotes, heredocs, `$( … )`, `&&`),
 * finds each `git push`, and works out which branch each refspec lands on. A
 * commit message that mentions `git push origin main` is text, and stays text.
 *
 * ## What it is not
 *
 * Not a security boundary. An agent set on getting round it could, and branch
 * protection on GitHub is the real backstop for `main`. It exists for the
 * mistake — the bare push from the wrong branch, the tool that looked harmless
 * — so every refusal says what to do instead. A refusal that only says no
 * teaches an agent to try spellings until one works.
 */

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";

const MAIN = "main";

/* Stands in for the output of a `$( … )` or backtick substitution inside a
   word. Its value is only known at run time, so a refspec or a path that
   contains one cannot be judged. */
const SUB = "\u0000";

const deny = (reason) => ({ decision: "deny", reason });
const ask = (reason) => ({ decision: "ask", reason });

const PUSH_OWN_BRANCH =
  "Push your own branch instead: `git push -u origin <your-branch>`. Do not open a pull request until Joel asks for one.";

/** The whole guard: hook input in, a decision or null out. */
export function decide(input) {
  const tool = String(input?.tool_name ?? "");
  const args = input?.tool_input ?? {};
  if (tool === "Bash") return bash(String(args.command ?? ""), input?.cwd || process.cwd());
  if (!tool.startsWith("mcp__")) return null;
  const cut = tool.lastIndexOf("__");
  const server = tool.slice(5, cut).toLowerCase();
  const name = tool.slice(cut + 2);
  if (server.includes("github")) return github(name, args);
  if (server.includes("supabase")) return supabase(name, args);
  if (server.includes("vercel")) return vercel(name, args);
  if (server.includes("linear")) return linear(name, args);
  return null;
}

/* ------------------------------------------------------------------------- */
/* Reading a shell command                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Split a command into the simple commands a shell would run, each as its
 * words after quote removal. Operators (`&&`, `||`, `;`, `|`, `&`, newlines)
 * end a command; `( … )`, `$( … )` and backticks open a nested one; a heredoc's
 * body is attached to the command that reads it rather than parsed as commands.
 * Variables are not expanded.
 *
 * `scope` records which subshell a command ran in, so that a `cd` inside
 * `( … )` does not follow the reader out of it.
 *
 * It never throws, whatever the input: a guard that crashes refuses the call.
 */
export function lex(src) {
  const out = [];
  let nextScope = 1;
  let scope = "0";
  const fresh = () => ({ words: [], heredocs: [], scope });
  let seg = fresh();
  let word = null; // null between words
  let dq = false; // inside "…"
  const stack = []; // enclosing contexts
  const pending = []; // heredocs waiting for the next newline

  const endWord = () => {
    if (word !== null) seg.words.push(word);
    word = null;
  };
  const endSeg = () => {
    endWord();
    if (seg.words.length || seg.heredocs.length) out.push(seg);
    seg = fresh();
  };
  const open = (kind) => {
    stack.push({ kind, seg, word, dq, scope });
    scope = `${scope}/${nextScope++}`;
    seg = fresh();
    word = null;
    dq = false;
  };
  const close = () => {
    endSeg();
    const f = stack.pop();
    scope = f.scope;
    seg = f.seg;
    word = f.word;
    dq = f.dq;
    if (f.kind !== "group") word = (word ?? "") + SUB;
  };
  const top = () => stack[stack.length - 1]?.kind;

  // Reads one word starting at i without keeping it: a redirection target or
  // a here-string. Returns the index of its last character.
  const skipWord = (i) => {
    while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
    while (i < src.length && !/[\s;&|<>()]/.test(src[i])) {
      const c = src[i];
      if (c === "'" || c === '"') {
        const j = src.indexOf(c, i + 1);
        i = j < 0 ? src.length : j + 1;
      } else if (c === "\\") i += 2;
      else i++;
    }
    return i - 1;
  };

  // At a redirection operator. An fd number just before it (the 2 in 2>&1) is
  // not an argument. A heredoc's delimiter is noted for the next newline.
  const redirect = (i) => {
    if (word !== null && /^\d+$/.test(word)) word = null;
    else endWord();
    if (src.startsWith("<<<", i)) return skipWord(i + 3);
    if (src.startsWith("<<", i)) {
      i += 2;
      let strip = false;
      if (src[i] === "-") {
        strip = true;
        i++;
      }
      while (src[i] === " " || src[i] === "\t") i++;
      let delim = "";
      while (i < src.length && !/[\s;&|<>()]/.test(src[i])) {
        const c = src[i];
        if (c === "'" || c === '"') {
          const j = src.indexOf(c, i + 1);
          const end = j < 0 ? src.length : j;
          delim += src.slice(i + 1, end);
          i = end + 1;
        } else if (c === "\\") {
          delim += src[i + 1] ?? "";
          i += 2;
        } else {
          delim += c;
          i++;
        }
      }
      pending.push({ delim, strip, seg });
      return i - 1;
    }
    i++;
    while (i < src.length && (src[i] === ">" || src[i] === "&" || src[i] === "|")) i++;
    return skipWord(i);
  };

  // At a newline with heredocs pending: their bodies are the lines that follow,
  // each up to its delimiter. Returns the index of the last character consumed.
  const readHeredocs = (i) => {
    let pos = i + 1;
    while (pending.length) {
      const h = pending.shift();
      let body = "";
      while (pos <= src.length) {
        const nl = src.indexOf("\n", pos);
        const end = nl < 0 ? src.length : nl;
        const line = src.slice(pos, end);
        pos = end + 1;
        if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break;
        body += `${line}\n`;
        if (nl < 0) break;
      }
      h.seg.heredocs.push(body);
    }
    return pos - 1;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (dq) {
      if (c === '"') dq = false;
      else if (c === "\\" && n !== undefined && '$`"\\\n'.includes(n)) {
        if (n !== "\n") word += n;
        i++;
      } else if (c === "$" && n === "(") {
        open("sub");
        i++;
      } else if (c === "`") open("tick");
      else word += c;
      continue;
    }
    if (c === "\n") {
      endSeg();
      if (pending.length) i = readHeredocs(i);
    } else if (c === " " || c === "\t" || c === "\r") endWord();
    else if (c === "\\") {
      if (n !== "\n") word = (word ?? "") + (n ?? "");
      i++;
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1);
      const end = j < 0 ? src.length : j;
      word = (word ?? "") + src.slice(i + 1, end);
      i = end;
    } else if (c === '"') {
      dq = true;
      word = word ?? "";
    } else if (c === "#" && word === null) {
      const j = src.indexOf("\n", i);
      i = (j < 0 ? src.length : j) - 1;
    } else if (c === "`") {
      if (top() === "tick") close();
      else open("tick");
    } else if (c === "$" && n === "(") {
      open("sub");
      i++;
    } else if (c === "(" && word === null) {
      endSeg();
      open("group");
    } else if (c === ")") {
      if (stack.length && top() !== "tick") close();
      else endSeg();
    } else if (c === ";" || c === "|") endSeg();
    else if (c === "&") {
      if (n === ">") i = redirect(i + 1);
      else endSeg();
    } else if (c === ">" || c === "<") i = redirect(i);
    else word = (word ?? "") + c;
  }
  while (stack.length) close();
  endSeg();
  return out;
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{", "}", "time"]);
const WRAPPERS = new Set(["command", "builtin", "exec", "nohup", "nice", "sudo", "doas", "env", "timeout", "stdbuf", "xargs"]);
// Wrapper options that take the next word as their value (sudo -u joel, nice -n 5, …).
const WRAPPER_VALUE = /^-(u|g|n|s|k|o|e|i|C|D|p|I|L|P|S)$/;
const base = (w) => w.split("/").pop();

/** The command's argv: leading assignments, keywords and wrappers removed. */
function argv(words) {
  let i = 0;
  let viaXargs = false;
  while (i < words.length) {
    const w = words[i];
    if (KEYWORDS.has(w) || ASSIGNMENT.test(w)) {
      i++;
      continue;
    }
    const b = base(w);
    if (!WRAPPERS.has(b)) break;
    if (b === "xargs") viaXargs = true;
    i++;
    while (i < words.length) {
      const o = words[i];
      if (WRAPPER_VALUE.test(o)) i += 2;
      else if (o.startsWith("-") || ASSIGNMENT.test(o) || (b === "timeout" && /^\d/.test(o))) i++;
      else break;
    }
  }
  return { args: words.slice(i), viaXargs };
}

/** A path as the shell would resolve it, or null when it depends on run time. */
function under(dir, p) {
  if (dir === null || p === undefined || p.includes("$") || p.includes(SUB)) return null;
  if (p === "~" || p.startsWith("~/")) p = homedir() + p.slice(1);
  return resolve(dir, p);
}

/* ------------------------------------------------------------------------- */
/* Bash                                                                      */
/* ------------------------------------------------------------------------- */

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const RUNNERS = new Set(["npx", "bunx", "pnpx", "pnpm", "yarn", "npm"]);
const SQL_CLIENTS = new Set(["psql", "pgcli", "usql"]);
const isSupabase = (w) => /^supabase(@[^/\s]*)?$/.test(base(w));

function bash(command, cwd, depth = 0) {
  if (depth > 5) return null;
  const dirs = new Map([["0", cwd]]);
  const dirOf = (scope) => {
    for (let s = scope; ; s = s.slice(0, s.lastIndexOf("/"))) {
      if (dirs.has(s)) return dirs.get(s);
      if (!s.includes("/")) return cwd;
    }
  };

  for (const seg of lex(command)) {
    const { args, viaXargs } = argv(seg.words);
    if (!args.length) continue;
    const cmd = base(args[0]);
    const dir = dirOf(seg.scope);

    if (cmd === "cd" || cmd === "pushd") {
      const target = args.slice(1).find((a) => !/^-[LPe@]+$/.test(a));
      dirs.set(seg.scope, target === "-" ? null : under(dir, target ?? "~"));
      continue;
    }

    // A command handed to another shell is judged the same way.
    if (SHELLS.has(cmd)) {
      const k = args.findIndex((a, i) => i > 0 && /^-[a-z]*c[a-z]*$/.test(a));
      if (k > 0 && args[k + 1] !== undefined) {
        const d = bash(args[k + 1], dir, depth + 1);
        if (d) return d;
      }
      continue;
    }
    if (cmd === "eval") {
      const d = bash(args.slice(1).join(" "), dir, depth + 1);
      if (d) return d;
      continue;
    }

    if (cmd === "git") {
      const d = gitCommand(args, dir, viaXargs);
      if (d) return d;
      continue;
    }

    const supabaseAt = isSupabase(args[0]) ? 0 : RUNNERS.has(cmd) ? args.findIndex(isSupabase) : -1;
    if (supabaseAt >= 0) {
      const words = args.slice(supabaseAt + 1).filter((a) => !a.startsWith("-"));
      const m = words.findIndex((a) => a === "migration" || a === "migrations");
      if (m >= 0 && words.slice(m + 1).includes("repair")) return deny(REPAIR);
    }
    if (supabaseAt >= 0 || SQL_CLIENTS.has(cmd)) {
      const sql = stripSql([args.join(" "), ...seg.heredocs].join("\n"));
      if (/schema_migrations/i.test(sql) && WRITE_SQL.test(sql)) return deny(REPAIR_SQL);
    }
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* git push                                                                  */
/* ------------------------------------------------------------------------- */

function gitCommand(args, dir, viaXargs) {
  const ctx = { dir, viaXargs, cfg: {}, repoKnown: true };
  let i = 1;
  while (i < args.length) {
    const w = args[i];
    if (w === "-C") {
      ctx.dir = under(ctx.dir, args[i + 1]);
      i += 2;
    } else if (w === "-c") {
      const [k, ...v] = String(args[i + 1] ?? "").split("=");
      ctx.cfg[k.toLowerCase()] = v.join("=");
      i += 2;
    } else if (/^--(git-dir|work-tree)(=|$)/.test(w)) {
      // Another repository than the directory says: its branch is unknown.
      ctx.repoKnown = false;
      i += w.includes("=") ? 1 : 2;
    } else if (/^--(namespace|config-env|super-prefix)$/.test(w)) i += 2;
    else if (w.startsWith("-")) i++;
    else break;
  }
  if (args[i] !== "push") return null;
  return push(args.slice(i + 1), ctx);
}

function push(rest, ctx) {
  let all = null;
  let del = false;
  let dry = false;
  const pos = [];
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i];
    if (w === "--") {
      pos.push(...rest.slice(i + 1));
      break;
    }
    if (w === "--all" || w === "--branches" || w === "--mirror") all = w;
    else if (w === "--delete") del = true;
    else if (w === "--dry-run") dry = true;
    else if (w === "--repo" || w === "--receive-pack" || w === "--exec" || w === "--push-option") i++;
    else if (w.startsWith("--")) continue;
    else if (w.startsWith("-") && w.length > 1) {
      // Bundled short flags (-uf). -o takes a value, attached or as the next word.
      for (let k = 1; k < w.length; k++) {
        if (w[k] === "o") {
          if (k === w.length - 1) i++;
          break;
        }
        if (w[k] === "d") del = true;
        if (w[k] === "n") dry = true;
      }
    } else pos.push(w);
  }
  if (dry) return null;
  if (all) return deny(`\`git push ${all}\` pushes every branch, and main is one of them. ${PUSH_OWN_BRANCH}`);

  // The first positional argument is always the repository, even with --repo.
  const remote = pos[0] ?? null;
  const specs = pos.slice(1);
  if (!specs.length) return barePush(remote, ctx);
  for (const spec of specs) {
    const d = refspec(spec, del, ctx);
    if (d) return d;
  }
  return null;
}

/** Whether a destination ref is main, in any spelling git accepts. */
export function targetsMain(ref) {
  const r = String(ref).replace(/^refs\//, "").replace(/^heads\//, "");
  if (r === MAIN) return true;
  if (!ref.includes("*")) return false;
  const glob = new RegExp(`^${ref.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return glob.test(MAIN) || glob.test(`refs/heads/${MAIN}`);
}

function refspec(spec, del, ctx) {
  if (spec.includes("$") || spec.includes(SUB)) {
    return cantTell(`the refspec \`${show(spec)}\` is only known when the command runs`);
  }
  const s = spec.startsWith("+") ? spec.slice(1) : spec;
  const colon = s.indexOf(":");
  const src = colon < 0 ? s : s.slice(0, colon);
  let dst = colon < 0 ? null : s.slice(colon + 1);
  if (dst === null) {
    if (!del && (src === "HEAD" || src === "@")) {
      const cur = currentBranch(ctx);
      if (cur === undefined) return cantTell(`\`${spec}\` means the current branch, and this guard could not read which one that is`);
      if (cur === null) return null; // detached HEAD: git refuses this push itself
      dst = cur;
    } else dst = src;
  }
  if (targetsMain(dst)) {
    const what = del || src === "" ? "deletes main" : "lands on main";
    return deny(`\`${spec}\` ${what}. Never push to main: every change goes through a pull request. ${PUSH_OWN_BRANCH}`);
  }
  return null;
}

/** A push with no refspec: git decides from config and the current branch. */
function barePush(remote, ctx) {
  if (ctx.viaXargs) return cantTell("xargs supplies the arguments when the command runs");
  if (ctx.dir === null || !ctx.repoKnown) {
    return cantTell("it pushes whatever the current branch is, in a directory that is only known when the command runs");
  }
  if (remote !== null && (remote.includes("$") || remote.includes(SUB))) {
    return cantTell(`the remote \`${show(remote)}\` is only known when the command runs, and so is what its config pushes`);
  }
  const r = remote ?? "origin";
  const configured = [ctx.cfg[`remote.${r}.push`], ...lines(git(ctx.dir, "config", "--get-all", `remote.${r}.push`))].filter(Boolean);
  if (configured.length) {
    for (const spec of configured) {
      const d = refspec(spec, false, ctx);
      if (d) return d;
    }
    return null;
  }
  const mode = String(ctx.cfg["push.default"] ?? git(ctx.dir, "config", "--get", "push.default").out ?? "simple").toLowerCase();
  if (mode === "nothing") return null;
  if (mode === "matching") {
    return deny(`push.default is \`matching\` here, so a bare \`git push\` pushes every branch that exists on both sides, main included. ${PUSH_OWN_BRANCH}`);
  }
  const cur = currentBranch(ctx);
  if (cur === undefined) return cantTell("it pushes the current branch, and this guard could not read which one that is");
  if (cur === null) return null;
  if (cur === MAIN) {
    return deny("You are on main, so a bare `git push` pushes main. Never push to main. Cut a branch first: `git switch -c claude/<area>-<change>`. Do not open a pull request until Joel asks for one.");
  }
  const merge = git(ctx.dir, "config", "--get", `branch.${cur}.merge`).out;
  if (merge && targetsMain(merge)) {
    return deny(`\`${cur}\` tracks main (it was cut from origin/main), so a bare \`git push\` can land on main. Push it by name, which also fixes the tracking: \`git push -u origin ${cur}\`.`);
  }
  return null;
}

function cantTell(why) {
  return deny(`This guard refuses a push it cannot read: ${why}. It will not guess, because the guess that fails is a push to main. Name the branch literally: \`git push -u origin <your-branch>\`.`);
}

/** The current branch; null when HEAD is detached, undefined when git cannot say. */
function currentBranch(ctx) {
  if (ctx.dir === null || !ctx.repoKnown) return undefined;
  const r = git(ctx.dir, "symbolic-ref", "--quiet", "--short", "HEAD");
  if (r.status === 0) return r.out;
  return r.status === 1 ? null : undefined;
}

function git(dir, ...args) {
  try {
    const out = execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    return { status: 0, out: out.trim() };
  } catch (e) {
    if (typeof e.status === "number") return { status: e.status, out: null };
    throw e; // a timeout or a missing git: fail closed, not open
  }
}

const lines = (r) => (r.out ? r.out.split("\n").map((l) => l.trim()).filter(Boolean) : []);
const show = (s) => s.replaceAll(SUB, "$(…)");

/* ------------------------------------------------------------------------- */
/* Migration history                                                         */
/* ------------------------------------------------------------------------- */

const REPAIR =
  "`supabase migration repair` rewrites the database's own record of which migrations ran. Repairing the migration history is a Never in CLAUDE.md, whoever asks. The gap it would close is deliberate: 20260908235234 is withheld because it holds personal data (supabase/README.md). If the history really disagrees with the repo, stop and tell the technical director.";
const REPAIR_SQL =
  "This SQL writes to supabase_migrations.schema_migrations, the database's record of which migrations ran. Repairing the migration history is a Never in CLAUDE.md, whoever asks. Reading it is fine; if you meant a read, drop the write.";

/* Statements that change the database. Checked after comments and string
   literals are removed, so `where status = 'deleted'` is not a delete. */
const WRITE_SQL =
  /\b(insert|update|delete|merge|upsert|truncate|create|alter|drop|grant|revoke|comment\s+on|copy|call|do|refresh|reindex|vacuum|cluster|lock|security\s+label|import\s+foreign)\b/i;

/** SQL with comments and string literals removed; quoted identifiers unwrapped. */
export function stripSql(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (c === "-" && n === "-") {
      const j = sql.indexOf("\n", i);
      i = j < 0 ? sql.length : j;
    } else if (c === "/" && n === "*") {
      const j = sql.indexOf("*/", i + 2);
      i = j < 0 ? sql.length : j + 2;
      out += " ";
    } else if (c === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      i = j + 1;
      out += " '' ";
    } else if (c === '"') {
      const j = sql.indexOf('"', i + 1);
      const end = j < 0 ? sql.length : j;
      out += sql.slice(i + 1, end);
      i = end + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* GitHub                                                                    */
/* ------------------------------------------------------------------------- */

const HELD =
  "It waits for Joel's click. Joel settled this on 2026-09-23 after an instruction to prepare was read as permission to act.";
const PR_ASK = {
  create_pull_request: "Opening a pull request",
  update_pull_request: "Changing a pull request",
  update_pull_request_branch: "Updating a pull request's branch",
  merge_pull_request: "Merging a pull request",
  enable_pr_auto_merge: "Turning on auto-merge, which merges with no click once checks pass,",
  pull_request_review_write: "Writing a pull request review, which can approve it,",
};
const API_COMMITS = new Set(["push_files", "create_or_update_file", "delete_file"]);
const REQUESTED = /Requested by Joel on \d{4}-\d{2}-\d{2}/;

function github(name, a) {
  if (API_COMMITS.has(name)) {
    const branch = String(a.branch ?? "");
    if (!branch || targetsMain(branch)) {
      return deny(`\`${name}\` would commit straight to ${branch ? "main" : "the default branch, which is main"}. Never push to main. ${PUSH_OWN_BRANCH}`);
    }
    return ask(`\`${name}\` commits to \`${branch}\` through the GitHub API, past the local push guard. ${HELD} A \`git push\` of your branch needs no click.`);
  }
  if (name === "create_pull_request") {
    if (a.draft === true) return deny("Open the pull request normally, not as a draft (CLAUDE.md).");
    if (!REQUESTED.test(String(a.body ?? ""))) {
      return deny('The body has no request line. A pull request is opened only when Joel asks, and the body records it: `Requested by Joel on YYYY-MM-DD — "what he said"` (CLAUDE.md). If he has not asked, push the branch and stop.');
    }
  }
  if (name === "update_pull_request" && typeof a.body === "string" && !REQUESTED.test(a.body)) {
    return deny('The new body drops the `Requested by Joel on YYYY-MM-DD — "what he said"` line. It is the only record of who asked for the pull request; keep it.');
  }
  if (name === "merge_pull_request" && a.merge_method !== "squash") {
    return deny('Merges here are squash merges (CLAUDE.md). Pass `merge_method: "squash"`.');
  }
  if (name in PR_ASK) return ask(`${PR_ASK[name]} ${HELD}`);
  return null;
}

/* ------------------------------------------------------------------------- */
/* Supabase and Vercel: the changes that are Joel's                          */
/* ------------------------------------------------------------------------- */

/* Reads go ahead. So does apply_migration: the technical director applies each
   migration at the gate, from its file, before merging. Everything else —
   creating, pausing or restoring the project, branches, edge functions, and any
   tool added later that is not a read — waits for Joel. */
const SUPABASE_READ = /^(get|list|search|generate)_|^query_logs$/;

function supabase(name, a) {
  if (name === "execute_sql" || name === "apply_migration") {
    const sql = stripSql(String(a.query ?? ""));
    if (/schema_migrations/i.test(sql) && WRITE_SQL.test(sql)) return deny(REPAIR_SQL);
    if (name === "apply_migration") return null;
    if (WRITE_SQL.test(sql)) {
      return ask("This SQL changes the database outside a migration. A schema change without its migration file in the same pull request is a Never (CLAUDE.md), and migrations are applied at the gate with `apply_migration`. It waits for Joel's click.");
    }
    return null;
  }
  if (SUPABASE_READ.test(name)) return null;
  return ask(`\`${name}\` changes the Supabase project itself, not a table. That is Joel's call. It waits for his click; approve it only if you asked for exactly this.`);
}

/* Reads go ahead, less the ones that hand out a credential, an environment
   variable's value or an access link. Everything else waits for Joel,
   including any tool added later. */
const VERCEL_READ = /^(get|list|search|read|filter|count|aggregate)_/;
const VERCEL_CREDENTIAL = new Set([
  "get_auth_token",
  "get_project_token",
  "get_edge_config_token",
  "get_access_to_vercel_url",
  "get_project_env",
  "get_shared_env_var",
]);

function vercel(name, a) {
  if (name === "web_fetch_vercel_url" || name === "status") return null;
  if (VERCEL_READ.test(name) && !VERCEL_CREDENTIAL.has(name) && !a?.decrypt) return null;
  return ask(`\`${name}\` changes the Vercel account or hands out access to it. Vercel is Joel's (CLAUDE.md; Joel, 2026-09-23): projects, domains, DNS, environment variables, the firewall, deployments and billing. It waits for his click; approve it only if you asked for exactly this.`);
}

/* ------------------------------------------------------------------------- */
/* Linear                                                                    */
/* ------------------------------------------------------------------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["owner:", "agent:"];
/* Who can act on a step: the roster by name, and the words for everyone or
   no one. Names are case-sensitive so `/api/health` does not count as Health. */
const ACTOR = /\b(Joel|TD|TechPad Gen|Resume Formatter|Resume|Coffee|Health|Cookbook)\b/;
const ACTOR_WORDS = /\b(technical director|every ?one|every ?body|no ?one|nobody|each agent|every agent|each owner|whoever)\b/i;
// A finished step has nobody left to act.
const DONE = /^(~~|\*\*Done\b|Done\b)/;
const RULE =
  "Every issue carries one `owner:` and one `agent:` label, passed by name, and its body ends with a `## Next steps` section of numbered steps, each naming who acts, such as `1. **Joel:** …` (CLAUDE.md).";

const listOf = (v) => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);

function linear(name, a) {
  if (!["save_issue", "create_issue", "update_issue"].includes(name)) return null;
  const creating = name === "create_issue" || (name === "save_issue" && !a.id);
  const problems = [];

  const countKinds = (labels, where) => {
    for (const k of KINDS) {
      const n = labels.filter((l) => l.toLowerCase().startsWith(k)).length;
      if (n !== 1) problems.push(`${where} ${n ? `${n} \`${k}\` labels` : `no \`${k}\` label`}`);
    }
  };
  const byName = (labels) => {
    if (labels.some((l) => UUID.test(l))) problems.push("a label is passed by ID, which this check cannot read");
  };

  if (creating) {
    const labels = [...listOf(a.labels), ...listOf(a.addLabels), ...listOf(a.labelIds)];
    byName(labels);
    countKinds(labels, "it has");
    if (typeof a.description !== "string" || !a.description.trim()) problems.push("it has no description");
    else problems.push(...nextSteps(a.description));
  } else {
    if (a.labels !== undefined || a.labelIds !== undefined) {
      const labels = [...listOf(a.labels), ...listOf(a.labelIds)];
      byName(labels);
      countKinds(labels, "the new label set has");
    }
    const added = listOf(a.addLabels);
    const removed = listOf(a.removeLabels);
    byName([...added, ...removed]);
    for (const k of KINDS) {
      const out = removed.filter((l) => l.toLowerCase().startsWith(k));
      const inn = added.filter((l) => l.toLowerCase().startsWith(k));
      if (out.length && !inn.length) problems.push(`it removes \`${out[0]}\` without adding another \`${k}\` label`);
      if (inn.length > 1) problems.push(`it adds ${inn.length} \`${k}\` labels`);
    }
    if (typeof a.description === "string") problems.push(...nextSteps(a.description));
    if (Array.isArray(a.patch)) problems.push(...patchProblems(a.patch));
  }

  if (!problems.length) return null;
  return deny(`This Linear ${creating ? "issue" : "update"} breaks the issue rules: ${problems.join("; ")}. ${RULE}`);
}

/** What is wrong with a body's Next steps section: an empty list when nothing. */
export function nextSteps(body) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const heads = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^ {0,3}(```|~~~)/.test(l)) fence = !fence;
    else if (!fence) {
      const m = l.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (m) heads.push({ i, level: m[1].length, text: m[2].replace(/[*_`]/g, "").trim() });
    }
  });
  const ns = heads.filter((h) => /^next steps\b/i.test(h.text)).pop();
  if (!ns) return ["the body has no `## Next steps` section"];
  const after = heads.find((h) => h.i > ns.i && h.level <= ns.level);
  if (after) return [`\`${after.text}\` comes after Next steps, and the body has to end with Next steps`];

  // Top-level numbered steps. A marker indented three spaces or more belongs
  // to the step above it.
  const items = [];
  let cur = null;
  for (const l of lines.slice(ns.i + 1)) {
    const m = l.match(/^ {0,2}(\d+)[.)]\s+(.*)$/);
    if (m) items.push((cur = { n: m[1], text: m[2] }));
    else if (cur && /^\s+\S/.test(l)) cur.text += ` ${l.trim()}`;
    else if (/^\S/.test(l)) cur = null;
  }
  if (!items.length) return ["its Next steps section has no numbered steps"];
  const nameless = items
    .filter((it) => !DONE.test(it.text) && !ACTOR.test(it.text) && !ACTOR_WORDS.test(it.text))
    .map((it) => it.n);
  if (nameless.length) {
    return [`step ${nameless.join(", ")} of Next steps does not name who acts (start it with the actor: Joel, TD, TechPad Gen, Resume Formatter, Coffee, Health or Cookbook)`];
  }
  return [];
}

/* A patch changes text the hook cannot see, so only what the patch itself
   shows is checked: that it does not take the heading out, and that it does
   not append a section after it. */
function patchProblems(ops) {
  const problems = [];
  const mentions = (s) => /next steps/i.test(String(s ?? ""));
  const heading = (s) => /(^|\n) {0,3}#{1,2}\s+\S/.test(String(s ?? ""));
  for (const op of ops) {
    const removes =
      (op?.op === "replace" && mentions(op.old_string) && !mentions(op.new_string)) ||
      (op?.op === "replace_range" && mentions(op.from) && !mentions(op.new_string));
    if (removes) problems.push("a patch removes the Next steps heading");
    if (op?.op === "append" && heading(op.text) && !mentions(op.text)) {
      problems.push("a patch appends a section after Next steps (insert it before `## Next steps` instead)");
    }
  }
  return problems;
}
