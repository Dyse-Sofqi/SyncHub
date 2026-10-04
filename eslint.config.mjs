import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

/**
 * 完整 lint —— **信息性**，不是闸门。
 *
 * 用的是官方审核的同一套规则（`eslint-plugin-obsidianmd`）。这里**不做**任何
 * 规则裁剪，所以它会报出仓库里既有的历史告警（`pnpm lint` 目前约 49 条，
 * 绝大多数是测试替身与旧代码的风格问题）。要的是「随时能看到全景」，
 * 而不是「假装全绿」。
 *
 * 真正当闸门用的是 `pnpm lint:review`（见 `eslint.review.config.mjs`）。
 */
export default defineConfig([
    {
        ignores: [
            "node_modules/**",
            // 探针/一次性脚本：不是发布产物，混进来只会淹没真问题。
            ".probe/**",
            "main.js",
            "esbuild.config.mjs",
            "scripts/**",
            "tests/**",
            "vitest.config.ts",
        ],
    },
    ...obsidianmd.configs.recommended,
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ["eslint.config.*", "eslint.review.config.*"],
                },
                tsconfigRootDir: import.meta.dirname,
            },
            /**
             * 桌面端的 Obsidian 插件跑在带 Node 的进程里，`process` 是能用的。
             *
             * 不声明的话 `no-undef` 会给它一条警告（`src` 里另外两条同类噪音是
             * `Buffer` / `require`，同样属于「规则没跟上运行环境」，一直留着）。
             * 这条不影响 `lint:review`（社区审核那套），只是让 `pnpm lint` 的基线
             * 数字干净一点 —— 基线是用来发现**新**问题的，不该被已知噪音占位。
             */
            globals: { process: "readonly" },
        },
    },
]);