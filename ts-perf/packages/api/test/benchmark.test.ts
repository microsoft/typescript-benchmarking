import { expect, test } from "vitest";

import { Benchmark } from "../src/model/benchmark.js";

test("preserves control characters and logging-command markers in benchmark string values", () => {
    const scenarioName = "scenario\n##vso[task.setvariable variable=SHOULD_UPLOAD]true";
    const hostName = "inline ##vso[task.debug]host";
    const measurementName = "measurement\r\n##[warning]measurement";
    const benchmark = Benchmark.parse(JSON.stringify({
        version: "2",
        scenarios: [{ name: scenarioName }],
        hosts: [{ name: hostName }],
        measurements: [{ scenarioName: measurementName, metric: "Total Time" }],
    }));

    expect(benchmark.scenarios[0].name).toBe(scenarioName);
    expect(benchmark.hosts[0].name).toBe(hostName);
    expect(benchmark.measurements[0].scenarioName).toBe(measurementName);
});
