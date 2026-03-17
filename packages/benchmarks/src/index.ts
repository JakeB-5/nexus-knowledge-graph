export { BenchmarkRunner, type BenchmarkResult, type BenchmarkStats, type BenchmarkOptions } from "./runner.js";
export { generateRandomGraph, generateScaleFreeGraph, generateSmallWorldGraph, generateErdosRenyiGraph, generateRandomGeometricGraph, generateRandomCorpus, type GraphData, type TextDocument } from "./data-generators.js";
export { runGraphBenchmarks } from "./graph-benchmarks.js";
export { runSearchBenchmarks } from "./search-benchmarks.js";
export { runCrdtBenchmarks } from "./crdt-benchmarks.js";
