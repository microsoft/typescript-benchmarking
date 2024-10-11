// @ts-check
import eslint from "@eslint/js";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        files: ["**/*.{ts,tsx,cts,mts,js,cjs,mjs}"],
    },
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "vitest.workspace.mjs",
            "cases/**",
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    {
        plugins: {
            "simple-import-sort": simpleImportSort,
            "unicorn": eslintPluginUnicorn,
        },
        rules: {
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
        },
    },
    // regexpPlugin.configs["flat/recommended"],
    {
        languageOptions: {
            parserOptions: {
                warnOnUnsupportedTypeScriptVersion: false,
            },
            globals: globals.node,
        },
    },
    {
        rules: {
            // eslint
            // "dot-notation": "error",
            "eqeqeq": "error",
            "no-caller": "error",
            "no-constant-condition": ["error", { checkLoops: false }],
            "no-eval": "error",
            "no-extra-bind": "error",
            "no-new-func": "error",
            "no-new-wrappers": "error",
            // "no-return-await": "error",
            // "no-template-curly-in-string": "error",
            "no-throw-literal": "error",
            "no-undef-init": "error",
            "no-var": "error",
            "object-shorthand": "error",
            "prefer-const": "error",
            "prefer-object-spread": "error",
            "unicode-bom": ["error", "never"],

            // "no-restricted-syntax": [
            //     "error",
            //     {
            //         selector: "Literal[raw=null]",
            //         message: "Avoid using null; use undefined instead.",
            //     },
            //     {
            //         selector: "TSNullKeyword",
            //         message: "Avoid using null; use undefined instead.",
            //     },
            // ],

            // Enabled in eslint:recommended, but not applicable here
            "no-extra-boolean-cast": "off",
            "no-case-declarations": "off",
            "no-cond-assign": "off",
            "no-control-regex": "off",
            "no-inner-declarations": "off",
            "no-empty": "off",

            // @typescript-eslint/eslint-plugin
            // "@typescript-eslint/unified-signatures": "error",
            "no-unused-expressions": "off",
            // "@typescript-eslint/no-unused-expressions": ["error", { allowTernary: true }],
            "@typescript-eslint/no-unused-expressions": "off",

            // Rules enabled in typescript-eslint configs that are not applicable here
            "@typescript-eslint/ban-ts-comment": "off",
            "@typescript-eslint/class-literal-property-style": "off",
            "@typescript-eslint/consistent-indexed-object-style": "off",
            "@typescript-eslint/consistent-generic-constructors": "off",
            "@typescript-eslint/no-duplicate-enum-values": "off",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
            "@typescript-eslint/no-var-requires": "off",
            "@typescript-eslint/no-empty-interface": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-empty-object-type": "off", // {} is a totally useful and valid type.
            "@typescript-eslint/no-require-imports": "off",
            // "@typescript-eslint/no-unused-vars": [
            //     "warn",
            //     {
            //         // Ignore: (solely underscores | starting with exactly one underscore)
            //         argsIgnorePattern: "^(_+$|_[^_])",
            //         varsIgnorePattern: "^(_+$|_[^_])",
            //         // Not setting an ignore pattern for caught errors; those can always be safely removed.
            //     },
            // ],
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/no-inferrable-types": "off",

            // Pending https://github.com/typescript-eslint/typescript-eslint/issues/4820
            "@typescript-eslint/prefer-optional-chain": "off",

            // eslint-plugin-unicorn
            "unicorn/prefer-node-protocol": "error",
        },
    },
    {
        files: ["**/*.mjs", "**/*.mts"],
        rules: {
            // These globals don't exist outside of CJS files.
            "no-restricted-globals": [
                "error",
                { name: "__filename" },
                { name: "__dirname" },
                { name: "require" },
                { name: "module" },
                { name: "exports" },
            ],
        },
    },
);
