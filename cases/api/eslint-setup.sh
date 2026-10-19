clone_scenario https://github.com/JoshuaKGoldberg/typescript-eslint.git 30d55234e6d719d3386884c3eef5c3a6c9d255f3

run_sandboxed sh -c '
    set -ex
    export NX_DAEMON=false NX_NO_CLOUD=true
    PACKAGE_MANAGER=$(node -p "require(\"./package.json\").packageManager")
    npx "$PACKAGE_MANAGER" --filter "typescript-eslint..." \
        --filter @typescript-eslint/ast-spec \
        --filter @typescript-eslint/rule-schema-to-typescript-types \
        --filter @typescript-eslint/rule-tester \
        --no-include-workspace-root install --frozen-lockfile --ignore-scripts \
        --package-import-method=copy --store-dir .pnpm-store
    npx "$PACKAGE_MANAGER" exec nx build typescript-eslint --skip-nx-cache
'

# Keep the generator checkout out of Nx's workspace discovery during the build.
git clone --filter=blob:none --no-checkout https://github.com/typescript-eslint/performance.git performance
git -C performance fetch origin 8b8a104c482f5d21ffeddf2d52a99b2eada22aa0
git -C performance switch --detach FETCH_HEAD
# Leave disposable sources so clone_scenario's normal cleanup removes them on reruns.
rm -rf performance/.git
cp ../../api/eslint-setup.mjs api-setup.mjs
run_sandboxed sh -c 'node api-setup.mjs "$1"' -- "$1"
