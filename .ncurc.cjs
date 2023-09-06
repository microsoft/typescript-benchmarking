module.exports = {
    target: (dependencyName, [{ semver, version, operator, major, minor, patch, release, build }]) => {
        if (dependencyName === "@octokit/rest") return "minor";
        return "latest";
    },
};
