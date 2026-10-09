import type { LocaleStrings } from "./zh-cn";

/**
 * English. Must mirror the structure of `zh-cn.ts` exactly —
 * `satisfies` turns any missing or misspelled key into a compile error.
 */

/** Shared by the confirm dialog (prefix + clickable address) and the add-repo modal (whole line). */
const mirrorCandidatePrefix = "Possible mirror: ";

export const en = {
    plugin: {
        name: "SyncHub",
        ribbonSync: "SyncHub: open the repository sync view",
        ribbonInstaller: "SyncHub: install community plugins",
        ribbonImages: "SyncHub: open the image manager",
        /**
         * Tooltip / alt text of the round avatar in the ribbon. It has no action — so
         * name the account. `host` is the platform's display name ("Gitee" / "GitHub"),
         * passed in by the assembly layer — the avatar can belong to either platform
         * (2026-10-06), so the sentence has to say which.
         */
        ribbonAvatar: (host: string, account: string) =>
            account
                ? `SyncHub: avatar of the ${host} account ${account}`
                : `SyncHub: avatar of the signed-in ${host} account`,
    },

    common: {
        ok: "OK",
        cancel: "Cancel",
        save: "Save",
        close: "Close",
        delete: "Delete",
        edit: "Edit",
        retry: "Retry",
        copy: "Copy",
        copied: "Copied to clipboard",
        loading: "Loading…",
        none: "None",
        unknown: "Unknown",
        yes: "Yes",
        no: "No",
        confirm: "Confirm",
        enabled: "Enabled",
        disabled: "Disabled",
        version: "Version",
        actions: "Actions",
        refresh: "Refresh",
        optional: "Optional",
        required: "Required",
    },

    host: {
        github: "GitHub",
        gitee: "Gitee",
        unknown: "Unknown host",
        tokenMissing: (host: string) =>
            `${host} requires an access token to read private repositories. Add one in settings.`,
        tokenInvalid: (host: string) => `The ${host} access token is invalid or expired.`,
        rateLimited: (host: string, resetAt: string) =>
            `${host} API rate limit reached. It resets at ${resetAt}.`,
        notFound: (host: string, repo: string) => `Repository ${repo} was not found on ${host}.`,
        networkFailed: (detail: string) => `Network request failed: ${detail}`,
        requestFailed: (status: number, detail: string) =>
            `Request failed (HTTP ${status}): ${detail}`,
        parseFailed: (input: string) =>
            `Could not parse the repository "${input}". Use owner/repo or a full repository URL.`,
        unsupportedHost: (input: string) =>
            `The host "${input}" is not supported yet. Only GitHub and Gitee are available.`,
    },

    settings: {
        cmdOpenSettings: "SyncHub: Open settings",

        tabs: {
            // One tab now covers both plugins and themes (a single list with a
            // type badge), so the label names both — a themes-only label would
            // never be found by someone looking for their plugins.
            tracked: "Plugins & themes",
            installer: "Plugin installer",
            sync: "Vault sync",
            images: "Image sync",
            general: "General",
        },

        token: {
            heading: "Access tokens",
            desc: "Needed for private repositories, and to raise the API rate limit. Tokens are stored on this device only — they are never written to data.json and never sync with your vault.",
            githubName: "GitHub access token",
            githubDesc: "Create one under Settings → Developer settings → Personal access tokens.",
            giteeName: "Gitee access token",
            giteeDesc: 'Create one under "Settings → Private tokens". The `projects` scope is required.',
            placeholder: "Paste a token…",
            test: "Test",
            testing: "Testing…",
            valid: (host: string, account: string) => `${host} token is valid. Account: ${account}`,
            invalid: (host: string) => `The ${host} token is invalid.`,
            cleared: "Token cleared",
            configured: "Configured",
            notConfigured: "Not set",
        },

        general: {
            /** The page heading (`heading: "General"`) was removed on 2026-10-06 — the tab label is the page name. */
            showNotices: "Show result notifications",
            showNoticesDesc: "When off, only errors are shown; success and progress notices are silenced.",
            debugLogging: "Verbose logging",
            debugLoggingDesc: "Log detailed request and sync information to the developer console.",
            statusBarLeftAlign: "Keep the sync item at the left of the status bar",
            statusBarLeftAlignDesc:
                "On: the sync item is ordered first in the status bar (only its own visual order changes; no other item moves). Off: no special treatment — the item falls back to the default order, after the other items. The status bar itself is untouched either way.",
            ribbonAvatar: "Show your avatar in the ribbon",
            ribbonAvatarDesc:
                "Show a round avatar (of the account your token belongs to) at the bottom of the left ribbon. Which platform's avatar to use is decided by the next item.",
            /** Which platform's avatar (2026-10-06, split out of the row above). */
            ribbonAvatarSource: "Use your Gitee avatar",
            ribbonAvatarSourceDesc:
                "On: the avatar of the account your Gitee token belongs to. Off: the GitHub one. Set a token for that platform under \"Access tokens\" below first — without one there is no avatar to show, and this toggle stays silent.",
            /** The avatar can only be changed on the platform itself; this sends the user there (hrefs are constants). */
            ribbonAvatarChangeLead: "To use a different one, change it on your profile page: ",
            ribbonAvatarChangeLinkGitee: "gitee.com/profile",
            ribbonAvatarChangeLinkGithub: "github.com/settings/profile",
        },

        installer: {
            /** The page heading was removed on 2026-10-06 — the tab label is the page name. */
            /** `enabled` / `enabledDesc` were removed on 2026-10-06 — see the zh-cn note. */
            autoCheck: "Check for updates on startup",
            autoCheckDesc: "Check tracked plugins and themes for updates shortly after Obsidian starts. Off by default — the check on opening this settings tab covers most cases.",
            autoCheckDelay: "Startup check delay (seconds)",
            autoCheckDelayDesc: "How long to wait before checking, so startup is not slowed down.",
            autoCheckOnSettingsOpen: "Check when opening settings",
            autoCheckOnSettingsOpenDesc: "Run an update check when this settings page opens. Repeated openings within a short window are skipped to save API quota.",
            /** `tracked` / `trackedDesc` were removed with the card around the button row (2026-10-05). */
            trackedEmpty: "No plugins or themes added yet.",
            selfHeading: "SyncHub itself",
            selfDesc:
                "Update SyncHub itself. Only the new files are written; the running plugin is not reloaded — the new version takes effect after you restart Obsidian.",
            /**
             * Self-update source toggle (2026-10-06: changed from a free-text field
             * to a toggle). Says the default, which address each state uses, what
             * happens when the mirror is down (automatic fallback to the official
             * repo, announced), and that a wrong source cannot clobber another plugin
             * — see the zh-cn note.
             */
            selfUseGitee: "Use the Gitee mirror for SyncHub updates",
            selfUseGiteeDesc:
                "On by default: check for and download SyncHub's own updates from the Gitee " +
                "mirror (gitee.com/sofqi/SyncHub), which is reachable directly in mainland China. " +
                "Turn it off to use the official repository (github.com/Dyse-Sofqi/SyncHub). " +
                "If the mirror is unavailable (for example Gitee's anonymous API is rate " +
                "limited), the official repository is tried instead and you are told about the " +
                "fallback. Before writing, the remote manifest's id must be ob-sync, so it " +
                "cannot overwrite another plugin.",
            mirrorDiscovery: "Discover Gitee mirrors",
            mirrorDiscoveryDesc: "When installing a GitHub plugin, look for a Gitee mirror first: a same-named repository, or a same-named repository under your own Gitee account (the latter needs a Gitee token). Downloads then use the mirror — faster in mainland China.",
        },

        sync: {
            /** The page heading was removed on 2026-10-06 — the tab label is the page name. */
            /**
             * The "Scheduled sync" row: **interval box + toggle**.
             *
             * Until 2026-10-02 that toggle said "Enable vault sync", which promised
             * more than it did — the sync commands were never affected by it, only the
             * timer was. The same day the three intervals (commit / push / pull) were
             * merged into one period: the main interval always ran the complete chain,
             * and the other two only invited the "does 0 block pushes?" misreading.
             */
            enabled: "Scheduled sync",
            enabledDesc:
                "Runs the complete chain in the background on the interval above (1–1440 minutes): " +
                "commit -> pull -> push. Turning it off stops the timer (the interval is " +
                "kept); the sync commands stay available.",
            /** Unit suffix after the interval box (`<input> min <toggle>`). */
            minutesUnit: "min",
            /** Accessible label for the interval box (it has no visible label of its own). */
            intervalAria: "Scheduled sync interval (minutes)",
            /**
             * The countdown badge after the "Scheduled sync" name (user request, 2026-10-02:
             * "if scheduled sync is on, show a countdown to the next sync").
             *
             * The argument is an already formatted duration (`3:07` / `1:05:00`, see
             * `formatCountdown`). When there is no timer (switch off, or suspended because the
             * strategy is reset) the badge is empty and hidden, so no "no next run" wording is
             * needed here.
             */
            countdown: (remaining: string) => `next sync ${remaining}`,
            /** Shown instead while that round is actually running (then "0:00 left" would be wrong). */
            countdownRunning: "syncing…",
            /**
             * Replacement description while the toggle is suspended (strategy = reset,
             * see `Automatics.start()`). Says both *why* it is greyed out and *how* to
             * resume — greying it out without an explanation reads as a broken plugin.
             */
            enabledSuspendedByReset:
                "Paused: the pull integration strategy is reset, so every scheduled sync " +
                "would discard what was just committed. Switch back to merge or rebase to resume.",
            desktopOnly: "Vault sync needs system git and is only available on desktop.",
            /**
             * "Open repository sync panel" (added 2026-10-02; on 2026-10-04 it was **merged into the
             * remote URL row**, so the "Actions" section — which held only this button — and its
             * heading were removed; that section cost a card plus a heading row).
             *
             * The panel already had three entry points (command palette, ribbon icon, status bar
             * item) — just not the page where you configure it. With the merge, the description
             * moved onto the button's tooltip (the row cannot hold two descriptions).
             */
            openView: "Open repository sync panel",
            openViewDesc:
                "The change list, commit, pull and push all live in this panel — the ribbon icon " +
                "and the status bar item open the same one, as does the \"SyncHub: Open repository " +
                "sync panel\" command.",
            /**
             * Notes shown at the top of this page, right under the heading. Both are
             * traps that only bite under a *combination* of settings (reset strategy +
             * scheduled sync on; editing the same file on two devices), so they would go
             * unread if buried in a single option's description.
             *
             * The first one is the other half of the suspension logic in
             * `Automatics.start()` — change one, change the other.
             */
            notesHeading: "Notes",
            notes: [
                "With the pull integration strategy set to reset, every scheduled sync runs " +
                    "commit -> pull -> push, and reset discards what was just committed. Scheduled " +
                    "sync is therefore paused while reset is selected; it switches back on when " +
                    "you return to merge or rebase.",
                "If a note was just changed on another device while you are editing it here, an " +
                    "automatic pull may overwrite what you have. Consider turning scheduled sync " +
                    "off while editing the same file on multiple devices.",
            ],
            commitMessage: "Commit message template",
            commitMessageDesc: "Supports {{date}}, {{hostname}}, {{numFiles}} and {{files}}.",
            strategy: "Pull integration strategy",
            strategyDesc:
                "How to reconcile diverged history on pull. merge keeps both sides and creates a merge commit; rebase replays local commits on top of the remote; reset discards local commits and takes the remote as-is.",
            strategyMerge: "Merge (keep both histories)",
            strategyRebase: "Rebase (linear history)",
            strategyReset: "Reset (remote wins, local commits dropped)",
            initRepo: "Initialize a git repository",
            initRepoDesc:
                "Create a git repository in the vault root (`git init`). You only need this while the " +
                "vault is not a repository yet. It also writes a default .gitignore when there is none " +
                "(an existing one is never overwritten), so workspace.json is not synced and does not " +
                "conflict across devices.",
            initDone: "Already a git repository",
            initNeeded: "Not a git repository yet",
            initRunning: "Initializing…",
            gitPath: "Git executable path",
            gitPathDesc: "Leave empty to use git from PATH. Only needed on Windows when git is not on PATH.",
            /**
             * "Where does git come from" (added 2026-10-02).
             *
             * A missing git is the **first hurdle** for this feature (especially on Windows, where
             * portable Node setups rarely ship git), and the plugin does not bundle it. The old copy
             * only said "put the path in the settings" — it never said where to get one.
             *
             * This line sits on its own with a **clickable** link after it (`gitPathLink`, wired up in
             * `settingsTab`): settings descriptions are plain text, so a bare `git-scm.com` would have
             * to be copied into a browser by hand.
             */
            gitPathDownload: "SyncHub does not bundle git. If you do not have it yet, get it from the official download page:",
            /** Link text for the download page (the URL itself is not translated). */
            gitPathLink: "git-scm.com",
            /**
             * The "Browse…" next to `gitPath` (added 2026-10-02).
             *
             * It opens the system file dialog (`core/desktopFileDialog.ts`) — Obsidian's public
             * API has no such thing, so it borrows the `electron.remote.dialog` that Obsidian
             * itself uses. Outside the desktop app the button does nothing, which is why the
             * text field beside it is **always** there.
             */
            gitPathBrowse: "Browse…",
            gitPathBrowseTitle: "Select the git executable",
            /** The "All files" filter entry — on non-Windows platforms git has no extension. */
            gitPathBrowseAllFiles: "All files",

            // The .gitignore section: editable in place so users can see what is
            // currently ignored without leaving the settings page.
            gitignoreHeading: "Ignore rules (.gitignore)",
            gitignoreDesc:
                "One rule per line; lines starting with `#` are comments. Changes here are written " +
                "straight to the .gitignore in the vault root — no separate editor needed. To edit it " +
                "in Obsidian's own editor, use the button below.",
            gitignoreMissing: "not created yet",
            gitignoreDirty: "unsaved changes",
            gitignoreSaved: "saved",
            gitignoreSave: "Save",
            gitignoreSaving: "Saving…",
            gitignoreRestore: "Fill in defaults",

            /**
             * "Add recommended ignore rules".
             *
             * The difference from "Fill in defaults" above has to be obvious:
             * that one **overwrites** (rules you wrote are gone), this one only
             * **fills in the gaps**. The desc says so.
             */
            recommended: {
                name: "Add recommended ignore rules",
                desc: 'Append the "large and unchanging" rules (fonts, Office temp files) to the .gitignore above. Only missing rules are added — nothing you wrote is touched.',
                action: "Add",
                noneAdded: "All recommended rules are already in .gitignore — nothing to add.",
                added: (count: number, groups: string) => `Added ${count} rule(s) (${groups}).`,
                groups: {
                    font: "fonts",
                    officeTemp: "Office temp files",
                    localState: "local state files",
                    pluginFolder: "plugin folder",
                },
            },
            localState: {
                name: "Stop tracking local state files",
                desc: "Keeps machine-local state — workspace.json, cursor-position caches — out of git. A history rewrite costs one unit per commit, and these files change every time you switch a tab, so keeping them tracked hands every sync cycle a pointless commit. Adds the ignore rules and removes the tracked ones from the index (your local files stay put).",
                action: "Fix",
                none: "Local state files are already sorted — no rules to add and nothing tracked.",
                rulesOnly: (rules: number) =>
                    `Added ${rules} ignore rule(s) (no local state files were tracked).`,
                done: (files: number, rules: number) =>
                    `Stopped tracking ${files} local state file(s) (added ${rules} ignore rule(s)). Your local files are untouched; the copies in history remain.`,
                modal: {
                    title: "Stop tracking local state files",
                    intro:
                        "This does two things: writes a few rules into .gitignore, and removes the files below from the git index. That removal becomes a deletion commit on the next sync, pushed to the remote.",
                    filesHeading: "Will be removed from the index:",
                    warningHeading: "What happens:",
                    warningLocal:
                        "No local file is touched — files like workspace.json are regenerated on every launch anyway.",
                    warningOthers:
                        "When another device pulls this, git deletes those files from its working tree and Obsidian regenerates them (the layout and cursor positions that device had are lost).",
                    warningHistory:
                        "Note: copies already in history do not disappear, so the repository size will not shrink — that needs a deep clean under Cleanup in the settings.",
                    cancel: "Cancel",
                    confirm: "Continue",
                },
            },
            /**
             * The pre-commit large-file check.
             *
             * The desc must explain why this step works and a later cleanup does
             * not — a user who does not see the point will just switch it off.
             */
            largeFileThreshold: {
                name: "Large-file threshold",
                desc: "Files larger than this are held back with a prompt when committing. Set to 0 to disable. Git history is irreversible — cleaning up later means rewriting every commit, so this is the only chance you get.",
            },
            ignorePluginFolder: {
                name: "Ignore plugin folder",
                desc: "Also add the whole plugin folder to the recommended rules. Plugins are the single largest source of repository bloat, but ignoring them means a fresh clone on another device will not have them installed.",
            },
            cleanupHeading: "Cleanup",
            cleanup: {
                checkName: "Inspect repository history",
                checkDesc:
                    "See what actually takes up the space in history, grouped by directory. Read-only. Look here first — in a 460 MB repository the notes themselves are often only a few dozen MB.",
                checkAction: "Inspect",
                gcName: "Reclaim space",
                gcDesc:
                    "Drops unreachable objects (dangling ones, leftovers from deleted branches). Safe, but it often reclaims nothing — large files usually sit in reachable history, and only a rewrite can remove those.",
                gcAction: "Reclaim",
                discardName: "Discard backups and reclaim",
                discardDesc:
                    "A rewrite leaves a backup behind — that is your only way back to the old history. Discarding it and reclaiming is what actually deletes the old objects and frees the space. This step cannot be undone.",
                discardDescNone:
                    "No backups right now — they only exist after you have run a deep clean.",
                discardAction: "Discard",
            },
            gitignoreOpen: "Open in editor",
            gitignoreSavedNotice: "Saved .gitignore.",
            gitignoreSaveFailed:
                "Could not save .gitignore — the file on disk still holds the previous content.",
            /**
             * "Stop git from tracking images" (2026-10-02).
             *
             * The user's words: "I want vault sync to not sync the images in the vault, because
             * image sync already handles them." It lives in the **.gitignore section of the Vault
             * sync page**: that is the file it edits, and that page is where you investigate "what
             * went into git" (the note on the Image sync page points here).
             *
             * The description has to lead with *why adding a line to .gitignore is not enough* —
             * that is the whole reason this action exists, and the easiest thing to get wrong:
             * .gitignore does nothing for files git already tracks.
             */
            untrack: {
                name: "Stop git from tracking images",
                desc:
                    "Adds the \"image folders to sync\" to .gitignore and makes git forget the " +
                    "images already committed (no local file is touched). A .gitignore line alone " +
                    "is not enough: it only affects untracked files, while tracked ones keep riding " +
                    "along with every commit. Sync once when you are done.",
                action: "Stop tracking",
                checking: "Checking that these images are all on R2…",
                needFolders:
                    "First set specific image folders on the Image sync settings page (not the " +
                    "whole vault) — \"the whole vault\" would mean git syncs nothing at all.",
                needCloud:
                    "Image sync is not configured yet (missing R2 account / bucket / secret). " +
                    "Once the images leave git, R2 is their only copy — set that up and sync once " +
                    "first.",
                notUploaded:
                    "{count} image(s) have not been synced to R2 yet. Upload them first (press " +
                    "\"Sync now\") and come back — other devices rely on the cloud copy to restore " +
                    "their local files after pulling this change.",
                done: "Added {rules} ignore rule(s) and stopped tracking {files} file(s); press \"Sync now\" to commit this change.",
                nothing: "These images were not tracked by git, and the ignore rules were already there.",
                failed: "Could not finish \"stop tracking images\"; the repository may be half-changed — check the .gitignore above.",
                modal: {
                    title: "Stop git from tracking images",
                    intro:
                        "Image sync already mirrors these to Cloudflare R2, so this steps them out " +
                        "of git — three things will happen:",
                    steps: [
                        "Write the rules into .gitignore (only the missing ones). New images stop entering git.",
                        "Remove the matching tracked files from git's index (git rm -r --cached): no local file is touched, but the next commit records a deletion.",
                        "The next sync (commit → pull → push) publishes that change to the remote.",
                    ],
                    /**
                     * Rule shape (added 2026-10-02).
                     *
                     * The user asked "can .gitignore only hold folders? Not image formats?" — it can
                     * hold both, and each shape has its own **precondition**, so they choose here and
                     * the precondition sits right next to the choice.
                     */
                    modeLabel: "What the rules are based on",
                    modeDesc:
                        "The two cover different scopes, and picking wrong leaves things out — read the line under the choice first.",
                    modeFolders: "Folders (the ones image sync mirrors)",
                    modeExtensions: "Extensions (images anywhere in the vault)",
                    foldersLabel: "Folders to stop tracking",
                    foldersNote:
                        "Exactly the scope image sync mirrors — whatever sits in those folders already " +
                        "belongs to image sync (the images, and any other file in them).",
                    extensionsLabel: "Image formats to ignore",
                    extensionsNote:
                        "Only images with these formats are ignored; other files still go into git. " +
                        "The precondition: image sync must cover these images (usually \"the whole " +
                        "vault\") — otherwise images outside its folders would leave git and R2 at the " +
                        "same time, with neither system handling them.",
                    warningHeading: "Two things to know first",
                    warningOthers:
                        "When other devices pull this change, git deletes those images from their " +
                        "working tree — image sync then restores them from R2. So those devices need " +
                        "image sync configured too, and before doing this the images must already be " +
                        "on R2 (this step checks that for you).",
                    warningHistory:
                        "Images already written into history do not disappear: git simply stops " +
                        "tracking them, the old objects stay in .git, and the repository does not get " +
                        "smaller (that needs a deep clean under Cleanup in the settings).",
                    cancel: "Cancel",
                    confirm: "Continue",
                },
            },

        },

        images: {
            /** The page heading was removed on 2026-10-06 — the tab label is the page name. */
            notesHeading: "Things to know",
            notes: [
                "Syncing only ever copies: every round fills the gaps on both sides (download what the " +
                    "cloud has extra, upload what the vault has extra). Nothing is deleted. Deletion is " +
                    "always something you start yourself — see the next item.",
                "When you delete an image inside the folders you sync on this device, the plugin asks whether the cloud copy " +
                    "should go too. Deleting is irreversible (R2 has no recycle bin); choosing \"keep\" " +
                    "records a marker so the next sync will not download it back. That prompt can be changed " +
                    "in the \"Conflicts and deletion\" section.",
                "Images inside the folders you sync are usually tracked by git as well. The two paths are " +
                    "independent: git keeps version history, R2 keeps images out of the repository and makes " +
                    "them linkable from outside. To keep them out of git entirely, use \"Stop tracking\" in " +
                    "Vault sync → .gitignore: it appends the ignore rules and makes git forget the images " +
                    "already committed (no local file is touched). SyncHub never edits .gitignore on its own.",
                "It runs on mobile too (Obsidian exposes no \"Wi-Fi only\" setting): dropping an image " +
                    "into the vault over cellular uploads it right away. Turn \"Sync after changes\" off " +
                    "if that matters — new images then wait for the next periodic round, a restart, or " +
                    "\"Sync now\".",
            ],
            /**
             * The **master switch**, and it covers more than "automatic sync": the startup round,
             * updating the cloud copy when you rename, and whether deleting a local image asks
             * about the cloud copy all belong to it.
             *
             * Renamed from "Enable image sync" on 2026-10-02. The old name read like "image sync on/off",
             * so "interval = 0" looked like "image sync is off" — while a round still runs **at startup**
             * (the user hit exactly this and asked). The new name says "automatic", and both descriptions
             * now spell the relationship out.
             */
            enabled: "Automatic image sync",
            enabledDesc:
                "Lets SyncHub run a round at startup and on the interval below; when you rename or " +
                "delete an image the cloud copy is handled right away too (renames are re-keyed, " +
                "deletions follow the policy you picked under \"Conflicts and deletion\"). Turning it " +
                "off stops all of that background work (it will not even ask about deleting the cloud " +
                "copy); the manual \"Sync now\" button here still works (that is you asking for it).",
            folders: "Image folders to sync",
            foldersDesc:
                "Only images inside these folders are processed, and deletions only ever happen inside " +
                "them — this is the single boundary of what the plugin may touch. Type a vault-relative " +
                "path below (for example attachments) and press Enter to add it; suggestions appear as " +
                "you type. \"Browse…\" picks one from the vault, \"Restore default\" goes back to the " +
                "repository root (whole vault, also written as .). Added folders are listed below, with " +
                "a trash button to remove each one.",
            foldersPlaceholder: "attachments",
            foldersEmpty:
                "No folder specified, so sync will not run. Type one (for example attachments), pick one " +
                "with \"Browse…\", or press \"Restore default\" to go back to the repository root.",
            foldersBrowse: "Browse…",
            foldersReset: "Restore default",
            /** The remove button on each added folder row (icon button, tooltip only). */
            foldersRemove: "Remove",
            folderPickerPlaceholder: "Search folders…",
            folderPickerRoot: "Repository root (whole vault)",
            folderPickerIncluded: "Already in scope",

            connectionHeading: "Cloudflare R2 connection",
            accountId: "R2 account ID",
            accountIdDesc:
                "The account ID shown on the R2 overview page in the Cloudflare dashboard. The bare ID is " +
                "enough (.r2.cloudflarestorage.com is appended for you); a full storage endpoint works too.",
            accountIdPlaceholder: "e.g. 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
            bucket: "Bucket name",
            bucketDesc:
                "Which bucket the images go into. Objects outside the prefix are never touched, but a " +
                "dedicated bucket is the least surprising setup.",
            accessKeyId: "Access Key ID",
            accessKeyIdDesc:
                "Create it under R2's \"Manage API tokens\" with at least object read & write permission. " +
                "This value is not a secret and will be synced to your other devices.",
            secretKey: "Secret Access Key",
            secretKeyDesc:
                "The value shown only once when the token is created. It is kept on this machine only " +
                "(system keychain) — never written to data.json, never synced.",
            secretPlaceholder: "Paste the secret…",
            secretSave: "Save secret",
            secretClear: "Clear secret",
            secretSaved: "R2 secret saved",
            secretCleared: "R2 secret cleared",
            secretConfigured: "Configured",
            secretNotConfigured: "Not configured",
            prefix: "Cloud prefix",
            prefixDesc:
                "Prefix for the object keys (for example images). Leave empty to put them at the bucket root. " +
                "It only decides *where* they live; changing it does not invalidate the sync state.",
            publicBaseUrl: "Public base URL",
            publicBaseUrlDesc:
                "A custom domain or r2.dev domain, used to build image links. Leave it empty and " +
                "\"Copy cloud link\" stays unavailable — the storage endpoint requires a signature on every " +
                "read, so a link built from it would never open. This is not guessed for you.",

            conflictHeading: "Conflicts and deletion",
            conflictPolicy: "When both sides changed",
            conflictPolicyDesc:
                "The same file changed locally and in the cloud. Images cannot be merged automatically, so one " +
                "side has to win.",
            conflictNewer: "Newest wins (compare modification times)",
            conflictLocal: "Local wins",
            conflictRemote: "Cloud wins",
            deleteRemotePolicy: "When deleting a local image, ask whether to delete the cloud backup too",
            /**
             * All three options need their consequence spelled out — this is a dropdown, so the
             * user only ever sees the current value. The "never" half matters most: without it,
             * a deleted image comes back on the next sync (mirroring refills from the cloud),
             * which looks like a bug.
             */
            deleteRemotePolicyDesc:
                "What happens to the cloud backup when you delete an image from the vault and the cloud " +
                "still has a copy: \"Ask each time\" opens one prompt; \"Always sync the cloud\" deletes " +
                "it right away (R2 has no recycle bin — deletion is irreversible); \"Never sync the " +
                "cloud\" leaves the cloud untouched — but that copy will be downloaded back on the " +
                "next sync (mirroring fills in both directions).",
            deleteRemoteAsk: "Ask each time",
            deleteRemoteAlways: "Always sync the cloud",
            deleteRemoteNever: "Never sync the cloud",
            /**
             * The "Sync after changes" row: **number + unit + toggle** (2026-10-06).
             *
             * It and "Periodic sync" below are two different jobs, so the description has to
             * spell out the difference — otherwise the user asks "I already turned on the
             * periodic sync, why do I need this":
             *
             * - this one covers **this device**: a round after you touched an image;
             * - the one below covers **elsewhere**: images uploaded by another device, or
             *   objects edited in the bucket — no local event fires for those, so we have to
             *   go ask.
             */
            changeSync: "Sync after changes",
            changeSyncDesc:
                "After an image is added or edited in the managed folders, sync once N seconds " +
                "(5–600) after you stop. A single editing session (dropping in a batch of images, " +
                "batch compression) is merged into one round, and it never starts while you are " +
                "still writing the file. It only covers this device; changes made elsewhere " +
                "are pulled back by \"Periodic sync\" below. With it off, new and edited images " +
                "wait for the next periodic round (or \"Sync now\").",
            /** Aria label for the delay box (no visible label next to it). */
            changeSyncDelayAria: "Delay before syncing after changes (seconds)",
            /**
             * The "Periodic sync" row: **number + unit + toggle** (second revision on 2026-10-02).
             *
             * The first revision only reworded "0 disables it"; the user then asked whether the
             * minimum should be 5. Tightening that lower bound needs something else to express
             * "off", hence the separate `autoSyncEnabled` field: the number has **no 0 meaning**
             * and ranges 5–1440.
             *
             * Renamed from "Automatic sync interval (minutes)": the unit moved into a span after
             * the box, and a row that now carries both a toggle and a period cannot be named
             * "interval".
             *
             * 2026-10-06: its **job changed** (local changes moved to the row above), so the
             * description was rewritten — the old "newly added or edited images are not uploaded
             * right away" sentence no longer holds.
             */
            autoSync: "Periodic sync",
            autoSyncDesc:
                "Checks the cloud every N minutes (5–1440) and pulls back changes made " +
                "elsewhere (images uploaded by another device, or objects edited in the " +
                "bucket) — changes made on this device are handled by the item above. Turning it " +
                "off only stops the periodic run; with the switch above on, a round still runs at " +
                "startup. Syncing never deletes anything.",
            /** Unit suffix after the interval box (`<input> min <toggle>`), same shape as the vault-sync page. */
            minutesUnit: "min",
            /** Unit suffix after the change-sync delay box (`<input> sec <toggle>`). */
            secondsUnit: "sec",
            /** Accessible label for the interval box (it has no visible label of its own). */
            intervalAria: "Periodic sync interval (minutes, 5–1440)",

            compressHeading: "Crop and compression defaults",
            compressQuality: "Default quality",
            compressQualityDesc:
                "Default quality for lossy formats (JPEG / WebP), 10–100. PNG is lossless and ignores it.",
            compressMaxEdge: "Default longest edge (pixels)",
            compressMaxEdgeDesc:
                "The default scaling limit in the crop/compress dialog. 0 means no scaling. It only shrinks — " +
                "enlarging a small image just makes it blurrier and bigger.",
            compressFormat: "Default output format",
            compressFormatDesc:
                "\"Keep as is\" does not mean \"no compression\": a JPEG stays a JPEG but is still re-encoded " +
                "at the chosen quality; only the container is preserved.",

            actionsHeading: "Actions",
            test: "Test connection",
            testing: "Testing…",
            testOk: (bucket: string) => `Connection works — bucket ${bucket} is reachable.`,
            testFailed: "Connection test failed",
            preview: "Preview changes",
            previewing: "Comparing…",
            syncNow: "Sync now",
            syncing: "Syncing…",
            openManager: "Open the image manager",
            openManagerDesc:
                "Lists every image in the folders you sync by three states — local, cloud, linked — " +
                "so you can filter out orphans, not-yet-uploaded and cloud-only images, then sync, " +
                "compress, rename or delete them in bulk.",
        },
    },

    installer: {
        /**
         * Command palette names. Deliberately separate from the modal title:
         * the modal does not need a plugin-name prefix, but the command palette
         * does — Obsidian users search commands by plugin name.
         */
        cmdAddRepo: "SyncHub: Add plugin repository",
        /** Command palette entry for the theme side of the same dialog (must keep the plugin-name prefix). */
        cmdAddTheme: "SyncHub: Add theme repository",
        cmdBindExisting: "SyncHub: Bind plugins and themes already installed in this vault",
        cmdCheckUpdates: "SyncHub: Check for plugin and theme updates",
        cmdUpdateAll: "SyncHub: Update all plugins and themes",

        /**
         * Names for the two tracked kinds. They have to read naturally inside a
         * sentence (e.g. `Writing theme "Minimal" failed`), because error prose
         * picks the word by kind — see `ofKind` in `installer/errors.ts`.
         */
        kindPlugin: "plugin",
        kindTheme: "theme",

        modalTitle: "Add plugin repository",
        themeModalTitle: "Add theme repository",
        themeRepoDesc:
            "Enter owner/repo, or paste a full theme repository URL (the repo needs manifest.json and " +
            "theme.css). SyncHub never switches themes for you — pick it under Settings → Appearance → Themes.",
        addTheme: "Add theme repository",
        themeResolved: (name: string, version: string) => `Theme: ${name} ${version}`,
        themeInstall: "Install theme",
        themeAfterInstallHint:
            "Pick it under Settings → Appearance → Themes — SyncHub never switches themes for you.",
        /** Shown when the address belongs to the other kind — say what was seen, then offer the fix. */
        looksLikeTheme:
            "This repository holds a theme (it has theme.css but no main.js), not a plugin.",
        looksLikePlugin:
            "This repository holds a plugin (it has main.js but no theme.css), not a theme.",
        switchToTheme: "Install it as a theme instead",
        switchToPlugin: "Install it as a plugin instead",
        repoLabel: "Repository",
        repoDesc: "Enter owner/repo, or paste a full GitHub / Gitee repository URL.",
        repoPlaceholder: "e.g. Dyse-Sofqi/SyncHub or https://gitee.com/owner/repo",
        resolve: "Resolve",
        resolving: "Resolving…",
        resolved: (host: string, repo: string) => `Resolved to ${repo} on ${host}`,
        versionLabel: "Version to install",
        versionLatest: "Latest release",
        versionListFailed: "Could not fetch the version list; the latest version will be used.",
        /** The version manager on a tracked plugin row (plugins only — themes are never pinned). */
        versionManage: "Version manager (roll back to a specific version)",
        versionManageTitle: "Choose a version",
        versionManageDesc:
            "Switch this plugin to another published version — picking an older one rolls it back. " +
            "Pick \"Latest release\" to follow the newest release again.",
        versionInstalled: (version: string) => `Installed: ${version}`,
        versionInstalledUnknown: "Installed: version unknown",
        versionCurrent: "current",
        versionLoading: "Fetching the version list…",
        versionNoneAvailable:
            "This repository publishes no releases (source install only), so there is no version to switch to.",
        versionFetchFailed: "Could not fetch the version list.",
        versionApply: "Switch to this version",
        versionSwitched: (name: string, version: string, source: string) =>
            `Switched ${name} to ${version} (from ${source})`,
        versionPinned: (version: string) => `Pinned to ${version}`,
        /** The "download source" section of the version dialog (plugins only). */
        versionSourceLabel: "Download source",
        versionSourceCurrent: (host: string, repo: string) => `Downloading from: ${host} · ${repo}`,
        versionSourceOrigin: (host: string, repo: string) => `Source repository: ${host} · ${repo}`,
        versionMirrorFoundPrefix: "Possible mirror found: ",
        versionMirrorNone:
            "No mirror found. Discovery only guesses two candidates: a same-named repository, and a " +
            "same-named repository under your own Gitee account (the latter needs a Gitee token first). " +
            "If the mirror lives under some other account, type its address below.",
        versionUseMirror: (host: string) => `Use the ${host} mirror`,
        versionManualLabel: "Mirror address",
        versionManualDesc:
            "For example sofqi/Trefoil, or paste a full URL. The plugin id there must match this entry, or the switch is refused.",
        versionManualPlaceholder: "e.g. sofqi/Trefoil",
        versionManualApply: "Use this address",
        versionManualChecking: "Checking the address…",
        versionMirrorFailed: "Could not switch to that mirror",
        enableAfterInstall: "Enable after installing",
        install: "Install",
        installing: "Installing…",
        installFailed: "Install failed",
        installed: (name: string, version: string, source: string) =>
            `Installed ${name} ${version} (from ${source})`,
        /** Reports the folder name — that is what the theme picker shows and what we wrote to disk. */
        themeInstalled: (id: string, version: string, source: string) =>
            `Installed theme ${id} ${version} (from ${source})`,
        /** `source` is composed by `features/installer/downloadSource.ts`. */
        updated: (name: string, version: string, source: string) =>
            `Updated ${name} to ${version} (from ${source})`,
        upToDate: (name: string) => `${name} is already up to date`,
        removed: (name: string) => `Unbound ${name}; its files are untouched`,
        removeFailed: "Failed to unbind",
        sourceRaw: "Source: repository source file",
        mirrorUnused: (host: string, repo: string) =>
            `Found a possible ${host} mirror: ${repo}. It is not used by default — check the box above to switch to it.`,
        mirrorSource: (host: string) => `${host} mirror`,
        mirrorLine: (host: string, repo: string) =>
            `${host} mirror · ${repo} · used for downloads`,
        /** The confirm-a-mirror flow. Mirrors are never adopted without these screens. */
        versionCorrected: (names: string) =>
            `The installed version did not match the recorded one — corrected from the files on disk: ${names}`,
        duplicateFolders: (name: string, count: number) =>
            `${name}: ${count} plugin folders declare the same id, so which one Obsidian loads is undefined. ` +
            `Move the extra one (usually a leftover backup) out of the plugins folder and restart.`,
        mirrorSuggestionLine: (host: string, repo: string) =>
            `Possible ${host} mirror · ${repo} · not in use yet, needs confirmation`,
        mirrorConfirmTitle: "Confirm mirror source",
        mirrorConfirmDesc:
            "This item currently follows the source repository below. Another repository was found that looks like its mirror — please confirm whether downloads should switch to it.",
        /** Prefix and address are separate so the address can render as a clickable link. */
        mirrorSourcePrefix: "Source repository (in use): ",
        mirrorCandidatePrefix,
        /** The composed sentence, used as a settings-row name in the add-repo modal. */
        mirrorConfirmCandidate: (host: string, repo: string) =>
            `${mirrorCandidatePrefix}${host} · ${repo}`,
        mirrorWarnHeading: "Check these two addresses yourself before confirming",
        mirrorWarnChecks:
            "The only evidence for calling this a mirror is that both manifests declare the same id. " +
            "That proves it is the same plugin — it does not prove it is the same code, the same " +
            "author, or that it keeps up with the source: a fork, or anyone re-uploading under the same " +
            "id, passes this check too.",
        mirrorWarnRisk:
            "Plugin code can read and write your entire vault. After you confirm, both downloads and " +
            "update checks go to the mirror — if it is not maintained by the original author, you are " +
            "not just changing a download source, you are changing who you trust.",
        mirrorWarnHowTo:
            "How to check: open the mirror repository and see whether its author, homepage or README " +
            "points back at the source repository; the latest version numbers should also be close. " +
            "If in doubt, leave it as is — nothing breaks by keeping the current source.",
        mirrorConfirmUse: (host: string) => `Use the ${host} mirror`,
        mirrorConfirmKeep: "Keep the current source",
        mirrorConfirmTooltip: "Confirm mirror source",
        mirrorConfirmed: (host: string, repo: string) =>
            `Now using the ${host} mirror ${repo}; the next update downloads from it`,
        mirrorDismissed: (repo: string) => `Dismissed the mirror suggestion for ${repo}`,
        mirrorToggleDesc:
            "When checked, downloads use this mirror. The only evidence is that both manifests declare " +
            "the same id, which does not prove it is the same code — only check it if you trust the address.",
        /**
         * Error messages.
         *
         * These used to be hard-coded in the logic layer, which is why English
         * users saw Chinese error text. Errors now carry a typed code plus
         * parameters; the prose lives here.
         */
        errors: {
            manifestNotJson: (context: string) =>
                `${context}: manifest.json is not valid JSON.`,
            manifestNotObject: (context: string) =>
                `${context}: manifest.json is not an object.`,
            manifestMissingField: (context: string, field: string) =>
                `${context}: manifest.json is missing the required field "${field}".`,
            manifestBadId: (context: string, id: string) =>
                `${context}: the plugin id "${id}" is invalid (lowercase letters, digits and hyphens only).`,
            missingManifest: (repo: string, of: string) =>
                `No manifest.json found in ${repo} — it may not be an Obsidian ${of} repository.`,
            missingRequiredFiles: (repo: string, files: string, of: string) =>
                `Could not find ${files} in ${repo}; cannot install that ${of}.`,
            missingBuildArtifacts:
                "If this is a source repository, the author may not have committed the build output.",
            incompatibleApp: (name: string, minVersion: string) =>
                `${name} requires Obsidian ${minVersion} or newer. Your version is too old, so the install was aborted.`,
            pluginIdConflict: (pluginId: string, repo: string) =>
                `The plugin id "${pluginId}" is already taken by another plugin; cannot install ${repo}.`,
            themeNameConflict: (id: string, repo: string, existing: string) =>
                `The theme folder "${id}" already holds another theme ("${existing}"), so ${repo} cannot ` +
                `be installed there. Remove or rename that theme first — SyncHub never overwrites another ` +
                `theme. If it is the one you are using, track its source under "Bind installed plugins and ` +
                `themes" instead of installing a second copy.`,
            themeNameInvalid: (repo: string, name: string) =>
                `The theme name "${name}" in ${repo} cannot be used as a folder name, and neither can the ` +
                `repository name — there is no folder to install it into.`,
            folderMissingRequired: (id: string, file: string, of: string) =>
                `The ${of} "${id}" is missing the required file ${file}; install aborted.`,
            writeFailedRolledBack: (id: string, of: string) =>
                `Writing the ${of} "${id}" failed. The previous state has been restored.`,
            writeFailedRollbackFailed: (id: string, of: string) =>
                `Writing the ${of} "${id}" failed, and restoring the previous state also failed. Please check its folder manually.`,
            cannotEnablePlugin:
                "This version of Obsidian does not allow a plugin to enable other plugins.",
            selfIdMismatch: (repo: string, id: string) =>
                `The plugin id in ${repo} is "${id}", not SyncHub itself (ob-sync) — the update was aborted so it cannot overwrite another plugin.`,
            selfUpdateDowngrade: (current: string, latest: string) =>
                `The latest remote version ${latest} is older than the running ${current}; aborted — updating should not downgrade you.`,
            communityIndexFailed: (status: number) =>
                `Could not fetch the official community index (HTTP ${status}). That index is hosted on GitHub, so it is unavailable when the network cannot reach it.`,
            rateLimitFallback: (host: string) =>
                `${host} API rate limit reached; falling back to installing from source files. ` +
                `Adding an access token in settings raises the limit significantly.`,
            apiUnavailableFallback: (host: string) =>
                `The ${host} API is temporarily unavailable; falling back to installing from source files.`,
            rateLimited: (host: string) => `${host} API rate limit reached.`,
            /**
             * "The release does list the file, but the download failed" — kept apart from
             * `missingRequiredFiles` because the next step is completely different
             * (check your network instead of asking the author).
             */
            assetDownloadFailed: (repo: string, files: string, of: string) =>
                `Could not download ${files} from ${repo}: the ${of}'s release does list the file, ` +
                `so this is a failed download rather than a missing file (release asset CDNs are ` +
                `often unreachable from mainland China). Check your network and retry, or use the Gitee mirror.`,
            /** A hand-typed mirror whose plugin id does not match — refused, not merely warned about. */
            mirrorIdMismatch: (repo: string, expected: string, found: string) =>
                `The plugin id in ${repo} is "${found}", but this entry tracks "${expected}" — ` +
                `the switch was refused so nothing wrong gets installed. Check that the address points at a mirror of the same plugin.`,
        },

        browse: "Browse community plugins",
        communitySearchPlaceholder: "Search by plugin name, author or description…",
        communityLoadFailed: "Could not load the community plugin list",

        checkOne: "Check for updates",
        /** The button row at the top checks every tracked item (same wording as a row's `checkOne`). */
        checkAll: "Check for updates",
        updateAll: "Update all",
        // These now cover plugins and themes alike — "item(s)" instead of
        // "plugin(s)", or updating a theme would report "Updated 1 plugin".
        updatedMany: (count: number, names: string, source: string) =>
            `Updated ${count} item(s): ${names} (from ${source})`,
        updateFailedMany: (count: number) => `${count} item(s) failed to update`,
        checkFailed: "Update check failed",
        checking: "Checking for updates…",
        /** Long-running progress notices (with a spinner) — they must say *what* is happening. */
        progressChecking: (name: string) => `${name}: checking for updates…`,
        progressUpdating: (name: string) => `${name}: updating…`,
        progressFetching: (name: string, file: string) => `${name}: fetching ${file}…`,
        updateAvailable: (name: string, version: string) => `${name} has a newer version: ${version}.`,
        updatesAvailable: (count: number, names: string) =>
            `${count} item(s) can be updated: ${names}`,
        checkNone: "All plugins and themes are up to date.",
        checkSummary: (outdated: number, failed: number) =>
            failed > 0
                ? `Check finished: ${outdated} update(s) available, ${failed} check(s) failed.`
                : `Check finished: ${outdated} update(s) available.`,
        updateToLatest: "Update to the latest version",
        updateBadge: (version: string) => `Update available → ${version}`,
        freeze: "Freeze (exclude from update checks)",
        unfreeze: "Unfreeze",
        frozen: "Frozen",
        openRepo: "Open repository in browser",
        /**
         * Unbind. The wording must say files are kept: this used to delete the
         * whole folder (and disable the plugin first), and now it only drops the
         * entry from the tracking list — see `InstallerService.unbind`.
         */
        remove: "Unbind (files are kept)",

        /** Shared by the button row and the dialog title (`BindExistingModal`). */
        bindTitle: "Bind existing plugins or themes",
        bindDesc:
            "Scans plugins and themes already installed in this vault and resolves their source repository via the official community index. Selected ones join the tracking list for update checks. No files are touched, and your active theme is never switched.",
        bindScanning: "Scanning installed plugins and themes…",
        bindEmpty: "No new plugins or themes to bind — they are all tracked already, or the vault has none.",
        bindPluginsHeading: (count: number) => `${count} bindable plugin(s) detected`,
        bindThemesHeading: (count: number) => `${count} bindable theme(s) detected`,
        bindSelectAll: "Select all / none",
        bindUnresolvedHeading: (count: number) =>
            `${count} plugin(s) with unrecognized source (not in the official community index):`,
        bindUnresolved: "Source unknown — add it manually via \"Add plugin repository\"",
        bindUnresolvedThemesHeading: (count: number) =>
            `${count} theme(s) with unrecognized source (not in the official community index):`,
        /**
         * Themes get a manual repository field, plugins do not — a deliberate
         * asymmetry: plugins have "Add plugin repository" as a fallback entry
         * point, while themes have no install path in this version, so without
         * this field an unrecognized theme could never be tracked.
         */
        bindUnresolvedTheme: "Source unknown — enter the repository to bind it",
        bindRepoPlaceholder: "e.g. owner/repo or a full repository URL",
        bindManualBind: "Bind",
        bindManualFailed: "Failed to bind the theme",
        bindConfirm: (count: number) => `Bind selected (${count})`,
        bindLoadFailed: "Failed to scan installed plugins and themes",
        bindDone: (count: number) => `Bound ${count} item(s); update checks now cover them.`,

        /**
         * SyncHub updating itself.
         *
         * The pending-restart line matters most: we do **not** reload ourselves,
         * so the files on disk are newer than the running code. Without saying so
         * the user would believe the new version is already active.
         */
        selfNotChecked: (version: string) => `Version ${version} · not checked yet`,
        selfUpToDate: (version: string) => `SyncHub ${version} is up to date`,
        selfUpdateAvailable: (current: string, latest: string) =>
            `Version ${latest} is available (you are on ${current})`,
        selfPendingRestart: (version: string) =>
            `${version} downloaded — restart Obsidian to apply it`,
        selfUpdating: "Downloading the new version…",
        selfUpdateDone: (version: string) =>
            `SyncHub ${version} downloaded — restart Obsidian to apply it`,
        selfCheckFailed: (reason: string) => `Could not check for SyncHub updates: ${reason}`,
        selfUpdateFailed: "Failed to update SyncHub",
        /**
         * Fallback notice. A fallback must be **said out loud** — a user who thinks
         * they are on the mirror while the code came from the official repo is exactly
         * the "unknown source" this module avoids.
         */
        selfSourceFallback: (from: string) =>
            `The self-update source ${from} was unavailable; retried against the official repository (github.com/Dyse-Sofqi/SyncHub).`,
        /** Appended to the status line (the notice disappears; the status line does not). */
        selfCheckFellBack: (from: string) =>
            `(${from} was unavailable, so the official repository was used)`,
    },

    sync: {
        // Renamed from "Source control" on 2026-09-19: the in-panel heading is
        // gone, so this is the only name the user sees — and "source control"
        // is git's word, not this plugin's job (it syncs the vault to a remote).
        viewTitle: "Repository sync",
        statusPulling: "Pulling…",
        statusPushing: "Pushing…",
        statusCommitting: "Committing…",
        /**
         * Chain wording for "Sync now" (2026-10-05).
         *
         * The user's words: "when I click Sync now, only the bottom-left status bar shows
         * how far along it is — that is not prominent enough". Besides the spinning ring on
         * the status bar item, the wording itself must say **which step of the chain** this is:
         * after clicking Sync now, "Committing…" reads like the whole action, so the user
         * assumes pull/push are not coming and clicks again.
         *
         * `statusSyncing` is the sidebar banner title (shared by all three stages).
         */
        statusSyncing: "Syncing…",
        statusChainCommitting: "Syncing: committing…",
        statusChainPulling: "Syncing: pulling…",
        statusChainPushing: "Syncing: pushing…",
        notARepo: "This vault is not a git repository yet.",
        /**
         * The message when git cannot be found (filled in 2026-10-02).
         *
         * It used to say only "set its path in settings" — which tells you how to point at git
         * but never where to get one, the one thing a user without git actually needs. The
         * message shows up in a `Notice` (plain text, no links), so the URL is spelled out.
         */
        gitNotFound: "Could not find the git executable. Install git first (git-scm.com), or put its full path in the settings.",
        /**
         * The panel's first-paint line while repository status is read.
         *
         * Added 2026-10-01 with the deferred-first-render work: Obsidian awaits `onOpen()`
         * while restoring the layout, and reading status there costs 10 git subprocesses
         * (see SourceControlView). Without it the panel sits empty for a few hundred ms
         * and reads as broken.
         */
        loadingRepo: "Reading repository status…",
        gitAuthFailed:
            "Remote authentication failed. Check that the access token for this platform is valid and has the required scope.",
        /**
         * git stalled and was aborted. This type exists so "nothing happens"
         * is never the whole story: it says what happened and what to try.
         */
        gitTimeout:
            "git produced no output for a long time, so this operation was aborted. Check your network (or proxy) and try again. If it keeps happening, the remote repository may be very large or may require credentials — for the latter, enter an access token in the settings.",
        /**
         * Cannot reach the remote (added 2026-10-02).
         *
         * The user's message was `getaddrinfo() thread failed to start` — libcurl could not even
         * start its DNS resolver thread. Shown raw, it leaves you guessing between network, proxy,
         * token and a broken plugin; this points at the network and the proxy (not the token, and
         * not reinstalling anything).
         */
        gitNetworkFailed:
            "Cannot reach the remote (name resolution or connection failed). Check your network and " +
            "proxy — if the proxy comes from environment variables (HTTP_PROXY / HTTPS_PROXY), " +
            "restart Obsidian once so the plugin picks them up; the connection test shows which step " +
            "fails.",
        /**
         * Shown once when scheduled sync has failed several times **in a row** (2026-10-02).
         *
         * A single failure stays in the log (it usually heals next round), but a persistent one must
         * not stay silent — nobody reads the console every day. `{count}` is the streak, `{reason}`
         * is the classified cause. The trailing "it will retry" matters: without it the notice reads
         * as "automatic sync is dead".
         */
        autoSyncFailedMany: (count: number, reason: string) =>
            `Scheduled sync has failed ${count} times in a row: ${reason} (it will retry next round)`,
        /**
         * Deliberately separate from the line above: the token is fine, the
         * problem is the username the plugin sent.
         */
        gitCredentialUsernameRejected:
            "The platform rejected the username in the credential — the token itself is valid. This is a plugin configuration error (the platform only accepts specific usernames). Please report this.",
        pushRejected:
            "The push was rejected by the remote. It likely has commits you do not have locally — pull first, then push.",
        noUpstream:
            "The current branch has no tracked remote branch, so it cannot be pulled. Set an upstream branch or push once first.",
        detachedHead:
            "HEAD is detached (not pointing at any branch), so pushing is not possible. Switch to a branch first.",
        nothingToCommit: "Nothing to commit.",
        // Note: this does NOT claim "in sync with the remote" — ahead === 0 only
        // means there is nothing new locally; you may still be behind.
        pushUpToDate: "Nothing to push (no new local commits).",
        pushNeedsCommit: (count: number) =>
            `Push only sends committed content, and you have ${count} uncommitted change(s). ` +
            `Use "Commit" (or "Sync now") first.`,
        pushDonePending: (count: number) =>
            `Pushed to the remote. Note: ${count} change(s) are still uncommitted — pushing does not commit them.`,
        pushDone: "Pushed to the remote.",
        commitsNotPushed: (count: number) =>
            `Committed; ${count} commit(s) are not pushed yet (use "Push" or "Sync now").`,
        syncedInSync: (size?: string) =>
            size
                ? `In sync: the local branch matches the remote · repository ${size}`
                : "In sync: the local branch matches the remote",

        repoSizeLabel: "Repository size",
        repoSizeDesc: (size: string, objects: number) => `${size} (${objects} object(s))`,
        pendingChangesLabel: "Pending changes",
        pendingChangesDesc: (size: string, files: number) => `${size} (${files} file(s))`,
        sizeUnknown: "unavailable",
        /**
         * Shown when auto sync is stopped by the large-file check.
         *
         * Must say both **why it stopped** and **where to resolve it** — "N large
         * files" alone leaves the user thinking sync is still running normally.
         */
        autoSyncLargeFilesPaused: (count: number) =>
            `${count} file(s) exceed the large-file threshold, so auto sync is paused — resolve them in the "Vault sync" panel (commit anyway, or untrack them) to resume.`,

        /**
         * The pre-commit large-file check.
         *
         * The copy is all about **cost**: each option has a price, and the user
         * cannot choose without seeing it. "These files are large" alone gives
         * them nothing to decide with.
         */
        largeFiles: {
            modal: {
                title: (count: number, thresholdMb: number) =>
                    `${count} file(s) exceed ${thresholdMb} MB`,
                intro:
                    "These files will be committed this time. Git history is irreversible — once committed, they occupy repository space forever.",
                newBadge: "new",
                warningHeading: "What each choice costs:",
                warningCommitAnyway:
                    "Commit anyway: every future change stores another full copy in history, so the repository keeps growing.",
                warningUntrack:
                    "Untrack and ignore: it loses version history (the local file stays), and it will not travel to your other devices.",
                warningHistory:
                    "Note: copies already in history do not disappear, so the repository size will not shrink — that needs a deep clean under Cleanup in the settings.",
                cancel: "Cancel",
                untrack: "Untrack and ignore",
                commitAnyway: "Commit anyway",
            },
            /**
             * Feedback after "untrack".
             *
             * Both halves matter: "local files are kept" answers "is my stuff
             * still there", and "copies in history remain" answers "why didn't
             * the repo shrink" — without the latter, an unchanged size reads as
             * a failed operation.
             */
            untracked: (files: number, rules: number) =>
                `Untracked ${files} file(s) (${rules} ignore rule(s) added). Local files are kept; copies already in history remain.`,
        },
        cleanup: {
            /** Shown when a precondition blocks the rewrite (see `RewriteBlockedReason`). */
            blocked: {
                "dirty-tree":
                    "There are uncommitted changes. Commit or discard them first — git refuses to rewrite history on a dirty working tree.",
                "no-commits": "This repository has no commits yet, so there is no history to clean.",
                "no-paths": "No paths were selected.",
            },
            gcFreed: (size: string) => `Reclaimed ${size}.`,
            gcNothing:
                "Nothing to reclaim — the large files sit in reachable history, and only a deep clean can remove those.",
            gcUnknown: "Reclaim finished, but the size could not be read, so the freed amount is unknown.",
            discardFreed: (size: string) =>
                `Backups discarded, ${size} freed. The previous history is gone for good.`,
            discardUnknown:
                "Backups discarded, but the size could not be read, so the freed amount is unknown.",
            pushDone: "Force-pushed to the remote.",
            report: {
                title: "Repository size inspection",
                loading: "Analysing history…",
                summary: (size: string, objects: number, commits: number) =>
                    `${size} of history objects (${objects} objects, ${commits} commits).`,
                note: "These are raw, uncompressed object sizes, so they are larger than what .git actually takes on disk.",
                dirsHeading: "Biggest directories",
                dirMeta: (size: string, objects: number) => `${size} · ${objects} objects`,
                rootLabel: "(files at the vault root)",
                rootNote: "Files at the vault root cannot be selected — removing them would wipe the whole vault.",
                selectNote: "Selection only decides which paths are removed, not how long it takes.",
                largestHeading: "Largest single objects",
                empty: "No history objects to analyse.",
                toConfirm: "Rewrite history",
                cancel: "Cancel",
            },
            confirm: {
                title: "Confirm the history rewrite",
                pathsHeading: "These paths will be removed from all of history:",
                estimate: (commits: number, minutes: number) =>
                    `This vault has ${commits} commits. The rewrite processes every commit one at a time, each spawning its own git process — so it makes no difference how many paths you pick, or how big the vault is. Measured at about 3.5 s per commit, that is roughly ${minutes} minute(s) — please do not close Obsidian while it runs.`,
                warningHeading: "What this changes:",
                warningHashes:
                    "Every commit hash changes. The remote will diverge from your local history, so a force push is required, and other devices must clone again.",
                warningRemote:
                    "Old history already pushed to the remote still exists in other people's clones — this cannot remove that.",
                warningBackup:
                    "A backup ref is created first, so you can still go back; but once that backup is discarded, there is no way back.",
                back: "Back",
                go: "Rewrite",
            },
            running: {
                title: "Rewriting history",
                text: "Every commit is processed one at a time, so this is slow by nature. Please do not close Obsidian.",
            },
            result: {
                title: "History rewritten",
                summary: (before: number, after: number) => `Commits ${before} → ${after}.`,
                backup: (ref: string) =>
                    `A backup is kept at ${ref}. Do not discard it until you have confirmed the vault is fine.`,
                noShrink:
                    "The size will not shrink yet — the backup still holds the old objects. Once you are happy, use \u201cDiscard backups and reclaim\u201d in the Cleanup section.",
                ignored: (count: number) =>
                    `${count} ignore rule(s) were added to .gitignore — without them those files would come straight back on the next commit.`,
                pushHint: "The remote has now diverged from your local history, so a force push is needed.",
                push: "Force push",
                done: "Done",
            },
        },
        noRemote: "No remote repository configured. Set the remote URL in settings.",
        conflictDetected: (count: number) =>
            `${count} conflicted file(s) detected. A conflict list has been written; resolve them and commit manually.`,

        cmdSync: "SyncHub: Sync now (commit → pull → push)",
        cmdCommit: "SyncHub: Commit all changes",
        cmdPush: "SyncHub: Push to remote",
        cmdPull: "SyncHub: Pull from remote",
        cmdInit: "SyncHub: Initialize repository",
        cmdAbortMerge: "SyncHub: Abort current merge (conflict recovery)",
        cmdEditRemote: "SyncHub: Edit remote URL",
        cmdOpenFileOnRemote: "SyncHub: Open current file in browser",
        cmdOpenFileHistoryOnRemote: "SyncHub: View current file history in browser",
        cmdOpenDiff: "SyncHub: View diff of the current file",

        // File context menu
        menuOpenOnRemote: "Open on remote",
        menuOpenHistoryOnRemote: "View history on remote",
        remoteLinkUnavailable:
            "Could not build a remote link. Make sure a GitHub or Gitee remote is configured and the repository has at least one commit.",

        actSync: "Sync now",
        // Tooltips for the three actions: "commit" and "push" are different
        // things (local vs remote) and the buttons are only one word each.
        actSyncHint: "Commit → pull → push, in one chain",
        actCommitHint: "Commit all changes to the local repository (no push)",
        actPushHint: "Pushes committed content only; it never commits for you",
        /**
         * The "nested repository" row (2026-10-04).
         *
         * The user's words: "why are all three entries in Changes folder paths, with no concrete
         * changes, yet counted as changes?" They were plugin folders developed in place inside the
         * vault, each carrying its own `.git`, so the vault recorded a pointer to another repository.
         * These three strings answer: what it is, why it cannot go away, and what to do about it.
         */
        nestedRepoBadge: "nested repo",
        nestedRepoHint:
            "Rows marked \"nested repo\" are plugins/themes that carry their own .git (such as the " +
            "ones you develop inside the vault): vault sync only records a pointer to them, never " +
            "their file contents — so they cannot be staged and have no file-level diff. Use the " +
            "button at the end of the row to stop tracking one (no local file is touched).",
        nestedRepoUntrack: "Stop tracking this nested repository (remove from the index + add to .gitignore; no local file is touched)",
        nestedRepoUntracked: "No longer tracking it; the directory and everything in it are untouched, and its own git still works.",
        actCommit: "Commit",
        actPull: "Pull",
        actPush: "Push",
        branchLabel: "Branch",

        // Sidebar detail view (see the zh-CN locale for why these exist).
        // `cmdOpenView` and `viewTitle` must stay separate: command names need the
        // SyncHub prefix to be findable in the command palette, panel titles do not.
        cmdOpenView: "SyncHub: Open repository sync panel",
        statusBarHint: "Click to open the repository sync panel",
        /**
         * Hover hint while an action is running (2026-10-05).
         *
         * Unlike the idle `statusBarHint`, what the user wants to know now is whether it is
         * still working and how far it has got — not how to open the panel. The panel itself
         * names the stage, so this just says that opening it shows the progress.
         */
        statusBusyHint: "Sync in progress — click to see the progress in the panel",
        actRefresh: "Refresh",
        actInit: "Initialise repository",
        actStage: "Stage this file",
        actUnstage: "Unstage this file",
        actStageAll: "Stage all",
        actUnstageAll: "Unstage all",
        actOpenFile: "Open this file",
        actOpenFileOnRemote: "Open this file on the remote",
        actDiff: "View diff",
        actAbortMerge: "Abort this merge",
        sectionStaged: (count: number) => `Staged changes (${count})`,
        sectionChanges: (count: number) => `Changes (${count})`,
        sectionConflicts: (count: number) => `Conflicts (${count})`,
        sectionHistory: "Recent commits",
        historyEmpty: "No commits yet.",
        historyFailed: "Could not read the commit history.",
        commitOnRemote: "View this commit on the remote",
        actDiffCommit: "View this commit's changes",
        /**
         * The panel's top row: the remote address (renamed from "Remote" on 2026-10-04 —
         * that field is now an editable address input, and "Remote" alone does not say so).
         */
        remoteLabel: "Remote URL",
        /**
         * The change list's **format filter** (2026-10-04).
         *
         * The user's words: "I want the change list to offer filtering by file format, especially
         * markdown, because note sync is mostly about syncing md documents." Options come from the
         * formats actually present in this change set (see `changeFilterOptions`).
         */
        filterLabel: "Format",
        filterAll: (count: number) => `All (${count})`,
        filterMarkdown: (count: number) => `Markdown (${count})`,
        filterNoExtension: "No extension",
        /** Nothing matches the filter (e.g. no note changes this round). */
        filterEmpty: "No changes with this format.",
        detachedHeadLabel: "Detached HEAD (not on any branch)",
        aheadOf: (count: number) => `${count} commit(s) ahead of the remote`,
        behindOf: (count: number) => `${count} commit(s) behind the remote`,
        inSyncWithRemote: "In sync with the remote",
        /**
         * "The committed part matches the remote, but the working tree still has uncommitted
         * changes" (2026-10-04).
         *
         * The user's words: "when there are new changes the text still says 'in sync with the
         * remote', only the colour differs — the wording is not accurate." `ahead = behind = 0`
         * only means the **committed** part matches; the working tree may still hold changes,
         * and saying "in sync" then makes people think they can shut down. This variant is
         * **not** highlighted green (green follows `isFullyInSync`).
         */
        inSyncWithPendingChanges: "In sync with the remote, but uncommitted changes remain",
        noUpstreamHint:
            "This branch does not track a remote branch yet; pushing will set it up.",
        conflictHint:
            "These files changed both locally and on the remote, so git cannot decide which side to keep. Resolve them and commit, or abort this merge.",

        // Diff view. `section` is indexed by kind (`t.sync.diff.section[kind]`).
        diff: {
            title: "Diff",
            section: {
                working: "Working tree changes (unstaged)",
                staged: "Staged changes",
                commit: "Changes in this commit",
            },
            loading: "Reading diff…",
            loadFailed: "Could not read the diff.",
            noChanges: "Nothing to show.",
            binary: "Binary file — content diff not shown.",
            renamed: "Contents unchanged; the file was only renamed.",
            tooLarge: "File is too large; content diff not shown.",
            truncated: "Too much content — only the beginning is shown.",
            /**
             * When the diff has **no target** (since 2026-10-04 the diff is a workspace tab,
             * which Obsidian writes into `workspace.json`; if that state carries no target the
             * tab is still open but has nothing to show).
             */
            noTarget: "This tab has no diff to show.",
            /**
             * View modes (2026-10-04): unified / side-by-side (like VS Code).
             * Side-by-side puts deletions on the left and additions on the right, pairing them
             * row by row — so when a change deletes two lines and adds three, the extra row has
             * content only on the right and is obvious at a glance.
             */
            modeLabel: "View",
            modeUnified: "Unified",
            modeSideBySide: "Side by side",
            noNewline: "(no newline at end of file)",
            stats: (additions: number, deletions: number) => `+${additions} −${deletions}`,
        },

        editRemoteTitle: "Edit remote URL",
        editRemoteLabel: "Remote repository URL",
        editRemotePlaceholder: "https://github.com/owner/repo.git",
        editRemoteSaved: (url: string) => `Remote set to ${url}`,
        editRemoteHint: {
            invalid:
                "That does not look like a git remote. Use a URL, git@host:path, or a local path.",
            credentials:
                "This URL carries a username and a token. Saving it writes them in plain text to the vault's .git/config — visible to `git remote -v`, and carried along by any backup or sync of the vault. Prefer a URL without credentials and put the token in the \"Access token\" field above (it is kept in the OS secret storage, not on disk).",
            notGithubOrGitee:
                "You can save and use this — syncing is plain git. But since the host is not GitHub or Gitee, no access token will be injected and \"Open on remote\" will not work (private repositories then rely on the OS credential helper).",
        },
        // ── .gitignore ──
        gitignoreCreated:
            "Created a .gitignore (it excludes Obsidian's workspace state files, which would otherwise cause conflicts between devices).",
        cmdEditGitignore: "SyncHub: Edit .gitignore",
        gitignoreOpenFailed:
            "Could not open .gitignore in Obsidian's editor. Use the box on the \"Vault sync\" " +
            "settings tab instead, or open the .gitignore in the vault root with a system editor.",
        /**
         * Contents of the .gitignore written when initialising a repository.
         *
         * The parameter is the vault's **config directory name** (`vault.configDir`),
         * not a hardcoded `.obsidian`: users can rename it, and a hardcoded value
         * would make every one of these rules match nothing.
         */
        gitignoreTemplate: (configDir: string) =>
            [
                "# Created by SyncHub.",
                "",
                "# Obsidian's workspace layout (panels, tabs, the files you have open). It is",
                "# per-device; syncing it only creates conflicts — the single most common",
                "# pitfall when syncing a vault across devices.",
                `${configDir}/workspace.json`,
                `${configDir}/workspace-mobile.json`,
                "",
                "# This plugin's own settings (sync interval, pull strategy…). They are",
                "# per-device; syncing them only makes two devices overwrite each other's",
                "# settings.",
                `${configDir}/plugins/ob-sync/data.json`,
                "",
                "# Obsidian's trash",
                ".trash/",
                "",
                "# OS junk",
                ".DS_Store",
                "Thumbs.db",
                "",
                "# Add anything else you want to ignore below.",
            ].join("\n"),

        repoInited: "Git repository initialized.",
        mergeAborted: "Merge aborted; the repository is back to the pre-pull state.",


        // ── Connection test ──
        diagnoseHeading: "Connection test",
        diagnoseDesc:
            "Check whether the sync configuration works and verify the access token. Read-only — nothing is modified.",
        diagnoseRun: "Test connection",
        diagnoseRunning: "Testing…",
        // Wording is deliberately limited to read access: this test uses
        // ls-remote, so it cannot verify the push path. Saying "sync is ready"
        // would imply push was checked too (measured: Gitee's credential
        // username rule is only enforced on the push path).
        diagnoseAllPassed: "All checks passed — the remote is readable.",
        diagnoseScopeNote:
            "Only read access (ls-remote) was verified. Push permission and credential rules can only be confirmed by an actual push.",
        diagnoseHasFailures: "Problems found — see below.",
        diagnoseCheck: {
            git: "git executable",
            repo: "git repository",
            remote: "Remote URL",
            platform: "Host and token",
            access: "Remote access",
        },
        diagnoseDetail: {
            gitOk: "Available",
            gitFailed: (detail: string) => `Not available: ${detail}`,
            repoOk: "Initialised",
            repoFailed: 'Not initialised yet — run the "SyncHub: Initialise repository" command first',
            remoteOk: (url: string) => url,
            remoteFailed: 'Not configured — set it with the "SyncHub: Edit remote URL" command',
            platformOk: (host: string) => `${host}, access token configured`,
            platformNoToken: (host: string) =>
                `${host}, no access token configured — public repositories will work, private ones will fail`,
            platformUnknown:
                "Host not recognised, so no token will be injected (private repositories fall back to the OS credential helper)",
            accessOk: (count: string) => `Reachable, read ${count} branch(es)`,
        },

        conflictGuideFile: "SyncHub conflict guide.md",
        conflictGuideTitle: "Sync conflict guide",
        conflictGuideIntro:
            "The following files were changed both locally and remotely, and git could not decide which side to keep. Conflict regions are marked with <<<<<<< and >>>>>>> inside the files.",
        conflictGuideFiles: "Conflicted files:",
        conflictGuideResolve:
            "How to resolve: open each file, edit the conflicted region to keep what you want (remove the marker lines), then run \"SyncHub: Sync now\" — the resolution will be committed and pushed.",
        conflictGuideAbort:
            "To discard this merge and return to the pre-pull state, run \"SyncHub: Abort current merge\".",
        conflictGuideFooter: (time: string) => `Generated automatically by SyncHub at ${time}. Safe to delete once resolved.`,
    },

    images: {
        formatOption: {
            keep: "Keep as is",
            jpeg: "JPEG",
            webp: "WebP",
            png: "PNG",
        },

        cmdSync: "SyncHub: sync images to the cloud",
        cmdPreview: "SyncHub: preview image sync changes",
        cmdEdit: "SyncHub: crop / compress the current image",
        cmdCopyLink: "SyncHub: copy the current image's cloud link",
        cmdManage: "SyncHub: open the image manager",

        toolbar: {
            crop: "Crop / compress",
            copyLink: "Copy cloud link",
        },

        notice: {
            syncDone: (uploaded: number, downloaded: number) =>
                `Image sync finished: ${uploaded} uploaded, ${downloaded} downloaded.`,
            syncNothing: "Image sync finished: local and cloud already match, nothing to do.",
            syncFailed: "Image sync failed",
            syncFailedMany: (count: number) => `${count} file(s) failed`,
            previewFailed: "Could not preview image sync changes",
            linkCopied: (url: string) => `Cloud link copied: ${url}`,
            noPublicBase:
                "No public base URL is configured, so a link cannot be built. Set a custom domain or r2.dev " +
                "domain under Image sync settings.",
            notInScope: "This image is not inside a folder you sync, so SyncHub will not sync it.",
            notConfigured:
                "Image sync is not configured yet. Fill in the R2 details and the image folders to sync on " +
                "the Image sync settings page first.",
            editorOpenFailed: "Could not open the image editor",
            singleUploadFailed: "Uploading this image failed (the local save was not affected)",
            deleteBackupFailed: "Could not delete the cloud backup",
            deleteBackupFailedMany: (count: number) => `${count} cloud backup(s) could not be deleted.`,
            remoteDeleted: (count: number) => `Deleted ${count} cloud backup(s).`,
            remoteKept: (count: number) =>
                `Kept ${count} cloud backup(s). The local copies are gone and will not be synced back.`,
            renameFailed: "Could not move the cloud copy to the new name",
            deleteOutOfScope: "Not inside a folder you sync; SyncHub will not touch it",
        },

        deleteRemote: {
            title: (count: number) =>
                count === 1
                    ? "Also delete this image from the cloud?"
                    : `Also delete these ${count} images from the cloud?`,
            desc:
                "These images still have a backup in the cloud. The local copies are already gone — what " +
                "should happen to the cloud ones?",
            more: (count: number) => `${count} more not listed.`,
            warningHeading: "Cloud deletions cannot be undone",
            warning:
                "The local copies can most likely still be restored from the vault's trash, but the cloud " +
                "has no trash — once deleted they are really gone (unless you have a copy elsewhere). " +
                "Choosing \"Keep cloud backup\" leaves the cloud copy in place; it just will not be synced " +
                "back to this device.",
            keep: "Keep cloud backup",
            delete: "Delete cloud backup too",
        },

        plan: {
            heading: "Pending changes",
            empty: "Local and cloud already match — nothing to do.",
            counts: (upload: number, download: number, conflicts: number, skipped: number) =>
                `${upload} to upload, ${download} to download, ${conflicts} conflicted, ${skipped} skipped.`,
            truncated:
                "There are more objects in the cloud than one listing can return, so this run may be " +
                "incomplete: images that were not listed will be treated as missing from the cloud and " +
                "uploaded again. Re-uploading is safe, just wasteful.",
            more: (count: number) => `${count} more not listed.`,
            action: {
                upload: "Upload",
                download: "Download",
                conflict: "Conflict",
                skip: "Skip",
            },
            reason: {
                "local-new": "New locally",
                "local-changed": "Changed locally",
                "remote-new": "New in cloud",
                "remote-changed": "Changed in cloud",
                "local-deleted": "Deleted locally (kept in cloud)",
                conflict: "Changed on both sides",
                "in-sync": "In sync",
            },
        },

        editor: {
            title: (name: string) => `Crop / compress: ${name}`,
            unsupported:
                "This format cannot be re-encoded through a canvas: SVG would be rasterised and GIF would keep " +
                "only the first frame. Convert it to PNG / JPEG / WebP first.",
            readFailed: "Could not read this image.",
            decodeFailed:
                "Could not decode this image — it may be corrupt, or the format is not supported on this platform.",
            format: "Output format",
            formatDesc:
                "Switching format usually changes the size far more than tweaking quality. WebP is typically " +
                "about a quarter smaller than JPEG and supports transparency.",
            quality: "Quality",
            qualityDesc:
                "Only affects lossy formats (JPEG / WebP). PNG is lossless and ignores this.",
            maxEdge: "Longest edge (pixels)",
            maxEdgeDesc: "0 means no scaling. It only shrinks — enlarging a small image just blurs it.",
            ratio: "Lock aspect ratio",
            ratioDesc: "Keep the ratio while dragging the selection.",
            ratioFree: "Free",
            ratioOriginal: "Original ratio",
            ratioSquare: "1:1",
            overwrite: "Overwrite the original",
            overwriteDesc:
                "Turn this off to save as a new file instead (same folder, -edited suffix), leaving the " +
                "original untouched. Overwriting is what most people want — links in notes point at the " +
                "original file, so saving a copy would leave those links showing the old image.",
            targetOverwrite: (path: string) => `Will write back to: ${path}`,
            targetNew: (path: string) => `Will create: ${path}`,
            reset: "Reset selection",
            cancel: "Cancel",
            save: "Save",
            saving: "Saving…",
            summary: (width: number, height: number, size: string, extension: string) =>
                `Output: ${width} × ${height} · ${size} · .${extension}`,
            saveFailed: "Could not save the image",
            saved: (path: string) => `Saved ${path}`,
        },

        manager: {
            title: "Image manager",

            scanning: "Scanning images and references…",
            scanningOf: (done: number, total: number) => `Scanning references… ${done}/${total}`,
            scanFailed: "Could not scan images and references",
            loading: "Scanning…",

            statLocal: "Local",
            statRemote: "Cloud",
            statLinked: "Linked",
            statOrphan: "Orphans",
            statTotal: "Total",
            statLocalBytes: "Local size",

            remoteFailed: (message: string) =>
                `Could not read the cloud listing: ${message}. The "Cloud" column below cannot be trusted.`,
            notConfigured: "Image sync is not configured, so only the local and reference states are shown.",
            truncated: "There are more cloud objects than one listing returns; this view may be incomplete.",

            filterLocal: "Local",
            filterRemote: "Cloud",
            filterLinked: "Linked",
            filterState: {
                any: "Any",
                yes: "Yes",
                no: "No",
            },
            minSize: "Min size",
            minSizeUnit: "KB",
            sort: "Sort",
            sortOption: {
                path: "By path",
                "size-desc": "Largest first",
                "size-asc": "Smallest first",
            },
            search: "Search",
            searchPlaceholder: "Path contains…",

            presetOrphans: "Orphans",
            presetPendingUpload: "To upload",
            presetRemoteOnly: "Cloud only",
            presetLarge: "Large images",
            presetReset: "Reset filters",

            selectAll: "Select all",
            clearSelection: "Clear selection",
            selectedCount: (count: number) => `${count} selected`,
            shown: (visible: number, total: number) => `Showing ${visible} / ${total}`,
            /**
             * The rescan button (2026-10-01). Labelled "rescan" rather than
             * "refresh" because it really re-reads the vault, re-lists the
             * bucket and re-scans references (seconds, not milliseconds).
             */
            refreshList: "Rescan",
            refreshHint:
                "Re-reads local files and the cloud bucket (use it after changing images outside Obsidian, or right after a sync)",
            /** Shift+click is invisible; without this line nobody finds it. */
            selectRangeHint: "Shift + click selects a range",
            empty: "No images in the folders you sync.",
            emptyFiltered: "No images match the current filters.",
            capped: (hidden: number) => `${hidden} more not shown — narrow the filters to see them.`,

            columnPath: "Path",
            columnSize: "Size",
            columnState: "State",
            badgeLocal: "Local",
            badgeRemote: "Cloud",
            badgeLinked: (count: number) => `Linked ×${count}`,
            badgeOrphan: "Unreferenced",

            actionSync: "Sync selected",
            actionCompress: "Compress & sync",
            /** The bottom one — it acts on the whole selection; the row pencil renames one file. */
            actionRename: "Bulk rename",
            /** Label of the pencil button on each row (icon only — this is its meaning). */
            renameThis: "Rename this file",
            /** Label of the row thumbnail — it is the entry point for the full-size preview. */
            previewOpen: "View full size",
            previewZoomIn: "Zoom in",
            previewZoomOut: "Zoom out",
            previewZoomReset: "Reset zoom",
            /** Shown when the image is bigger than the window (drag is the only way to see the rest). */
            previewPannable: "Drag to pan",
            previewPannableHint: "The image is larger than the window — drag to see the rest",
            actionDeleteLocal: "Delete local",
            actionDeleteBoth: "Delete local + cloud",
            noSelection: "Select the images you want to act on first.",
            compressHint: (params: string) =>
                `Compression uses the settings page values (quality / max edge = ${params}), keeps the ` +
                `original format, and only writes back when the result is smaller.`,

            syncing: "Syncing the selected images…",
            syncDone: (uploaded: number, downloaded: number, failed: number) =>
                failed > 0
                    ? `Selection synced: ${uploaded} uploaded, ${downloaded} downloaded, ${failed} failed.`
                    : `Selection synced: ${uploaded} uploaded, ${downloaded} downloaded.`,
            syncFailed: "Could not sync the selected images",
            syncFailedMany: (count: number) => `${count} image(s) could not be synced.`,

            compressing: "Compressing…",
            compressingOf: (done: number, total: number) => `Compressing… ${done}/${total}`,
            compressNothing: (skipped: number) =>
                `Nothing was compressed — ${skipped} image(s) either cannot be re-encoded (SVG / GIF) or got larger.`,
            compressDone: (count: number, saved: string, skipped: number) =>
                `Compressed ${count} image(s), saving ${saved}${skipped > 0 ? ` (${skipped} skipped)` : ""}.`,
            compressFailed: (count: number, sample: string) =>
                `${count} image(s) failed to compress, e.g. ${sample}.`,

            renaming: "Renaming…",
            renameTitle: (count: number) => `Rename ${count} image(s)`,
            renameDesc: (placeholders: string) =>
                `Build the new file names from a template. Available placeholders: ${placeholders}. ` +
                `The folder stays the same — Obsidian updates the links in your notes for you.`,
            renameTemplate: "Name template",
            renameStart: "Start number",
            renamePreviewCount: (renameable: number, total: number) =>
                `${renameable} of ${total} selected will be renamed.`,
            renameProblem: {
                unchanged: "name unchanged, skipped",
                invalid: "invalid name, skipped",
                taken: "target exists, skipped",
                extChanged: "extension changed, skipped",
            },
            renameConfirm: (count: number) => `Rename ${count}`,
            renameCancel: "Cancel",
            renameDone: (renamed: number, planned: number) => `Renamed ${renamed} of ${planned}.`,
            renameFailedMany: (count: number, sample: string) =>
                `${count} image(s) could not be renamed, e.g. ${sample}.`,
            renameMissing: "the file is no longer in the vault",

            renameFileTitle: "Rename file",
            renameFileDesc:
                "Only the file name changes; the folder stays the same. Omit the extension to keep the " +
                "current one — links pointing at it in your notes are updated for you.",
            renameFileName: "File name",
            renameFileConfirm: "Rename",
            renameFileDone: (name: string) => `Renamed to ${name}.`,

            deleting: "Deleting…",
            deleteDone: (local: number, remote: number, failed: number) =>
                failed > 0
                    ? `Deleted ${local} local and ${remote} cloud copy/copies; ${failed} failed.`
                    : `Deleted ${local} local and ${remote} cloud copy/copies.`,
            deleteFailed: "Bulk delete failed",
            deleteFailedMany: (count: number, sample: string) =>
                `${count} image(s) could not be deleted, e.g. ${sample}.`,

            confirmLocalTitle: (count: number) => `Delete the local copies of ${count} image(s)?`,
            confirmLocalDesc:
                "The local copies go to the trash (per your \"Settings → Files and links → Deleted files\" choice). " +
                "The cloud copies stay — but they will not be synced back to this device: SyncHub records that " +
                "you deleted them, otherwise the next sync would download them again.",
            confirmLocalOk: (count: number) => `Delete ${count} local copy/copies`,

            confirmBothTitle: (count: number) => `Delete ${count} image(s) locally and in the cloud?`,
            confirmBothDesc:
                "The local copies go to the trash and the cloud copies are really deleted. After this, neither side has them.",
            confirmBothWarningHeading: "Cloud deletion cannot be undone",
            confirmBothWarning:
                "The local copies can most likely be restored from the trash, but R2 has no trash — once " +
                "deleted they are gone (unless you have another copy elsewhere). Also, any links to them in your " +
                "notes will become broken links.",
            confirmBothOk: (count: number) => `Delete ${count} (including cloud)`,
            confirmCancel: "Cancel",
        },

        errors: {
            notConfigured: (missing: string) =>
                `Image sync is not configured yet; missing: ${missing}. Fill it in on the Image sync settings page.`,
            noFolders:
                "No folders to sync are configured. Add one (for example attachments) on the Image sync settings page.",
            authFailed:
                "R2 rejected the request: the Access Key ID or Secret Access Key is wrong, or the token has no " +
                "permission for this bucket.",
            bucketNotFound: (bucket: string) =>
                `Bucket ${bucket} was not found. Check the name, and whether the token is scoped to it.`,
            listFailed: (status: number, detail: string) =>
                `Listing cloud objects failed (HTTP ${status}): ${detail}`,
            uploadFailed: (path: string, status: number, detail: string) =>
                `Uploading ${path} failed (HTTP ${status}): ${detail}`,
            downloadFailed: (path: string, status: number, detail: string) =>
                `Downloading ${path} failed (HTTP ${status}): ${detail}`,
            copyFailed: (path: string, status: number, detail: string) =>
                `Moving the cloud copy to ${path} failed (HTTP ${status}): ${detail}. ` +
                `The local rename already succeeded; the next sync will upload it.`,
            deleteFailed: (path: string, status: number, detail: string) =>
                `Deleting ${path} in the cloud failed (HTTP ${status}): ${detail}`,
            network: (detail: string) =>
                `Could not reach R2: ${detail}. Check your network (or proxy) and retry.`,
            localReadFailed: (path: string, detail: string) =>
                `Reading the local file ${path} failed: ${detail}`,
            localWriteFailed: (path: string, detail: string) =>
                `Writing the local file ${path} failed: ${detail}`,
            decodeFailed: (path: string) =>
                `Could not decode ${path} — it may be corrupt, or the format is unsupported on this platform.`,
        },
    },
} satisfies LocaleStrings;
