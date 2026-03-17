import { describe, it, expect } from "vitest";
import {
  noSelfLoops,
  noDuplicateEdges,
  maxEdgesPerNode,
  validNodeTypes,
  validEdgeTypeCombinations,
  acyclicEdgeTypes,
  validEdgeEndpoints,
  isConnected,
  uniqueNodeIds,
  uniqueEdgeIds,
  maxOutDegree,
  type Graph,
} from "../rules/graph-rules.js";

// Minimal helper to build test graphs
function makeGraph(
  nodes: { id: string; type: string }[],
  edges: { id: string; source: string; target: string; type: string }[]
): Graph {
  return { nodes, edges };
}

describe("noSelfLoops", () => {
  const rule = noSelfLoops();

  it("passes a graph with no self-loops", () => {
    const g = makeGraph(
      [{ id: "A", type: "Person" }, { id: "B", type: "Person" }],
      [{ id: "e1", source: "A", target: "B", type: "knows" }]
    );
    expect(rule.validate(g)).toBe(true);
  });

  it("fails a graph containing a self-loop", () => {
    const g = makeGraph(
      [{ id: "A", type: "Person" }],
      [{ id: "e1", source: "A", target: "A", type: "knows" }]
    );
    expect(rule.validate(g)).toBe(false);
  });

  it("passes empty graph", () => {
    expect(rule.validate(makeGraph([], []))).toBe(true);
  });
});

describe("noDuplicateEdges", () => {
  const rule = noDuplicateEdges();

  it("passes a graph with unique edges", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }],
      [
        { id: "e1", source: "A", target: "B", type: "link" },
        { id: "e2", source: "B", target: "A", type: "link" },
      ]
    );
    expect(rule.validate(g)).toBe(true);
  });

  it("fails when duplicate edge exists (same source, target, type)", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }],
      [
        { id: "e1", source: "A", target: "B", type: "link" },
        { id: "e2", source: "A", target: "B", type: "link" },
      ]
    );
    expect(rule.validate(g)).toBe(false);
  });

  it("allows same endpoints with different types", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }],
      [
        { id: "e1", source: "A", target: "B", type: "link" },
        { id: "e2", source: "A", target: "B", type: "depends" },
      ]
    );
    expect(rule.validate(g)).toBe(true);
  });
});

describe("maxEdgesPerNode", () => {
  const rule = maxEdgesPerNode(2);

  it("passes when all nodes have <= max edges", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }, { id: "C", type: "X" }],
      [
        { id: "e1", source: "A", target: "B", type: "t" },
        { id: "e2", source: "A", target: "C", type: "t" },
      ]
    );
    expect(rule.validate(g)).toBe(true);
  });

  it("fails when a node exceeds max edges", () => {
    const g = makeGraph(
      [
        { id: "A", type: "X" },
        { id: "B", type: "X" },
        { id: "C", type: "X" },
        { id: "D", type: "X" },
      ],
      [
        { id: "e1", source: "A", target: "B", type: "t" },
        { id: "e2", source: "A", target: "C", type: "t" },
        { id: "e3", source: "A", target: "D", type: "t" }, // A now has 3 edges
      ]
    );
    expect(rule.validate(g)).toBe(false);
  });
});

describe("validNodeTypes", () => {
  const rule = validNodeTypes(["Person", "Company"]);

  it("passes when all types are allowed", () => {
    const g = makeGraph(
      [{ id: "A", type: "Person" }, { id: "B", type: "Company" }],
      []
    );
    expect(rule.validate(g)).toBe(true);
  });

  it("fails when an unknown type is present", () => {
    const g = makeGraph(
      [{ id: "A", type: "Person" }, { id: "B", type: "Robot" }],
      []
    );
    expect(rule.validate(g)).toBe(false);
  });
});

describe("validEdgeTypeCombinations", () => {
  const rule = validEdgeTypeCombinations([
    { edgeType: "employs", sourceTypes: ["Company"], targetTypes: ["Person"] },
  ]);

  it("passes valid combination", () => {
    const g = makeGraph(
      [{ id: "C1", type: "Company" }, { id: "P1", type: "Person" }],
      [{ id: "e1", source: "C1", target: "P1", type: "employs" }]
    );
    expect(rule.validate(g)).toBe(true);
  });

  it("fails invalid combination (Person employs Company)", () => {
    const g = makeGraph(
      [{ id: "P1", type: "Person" }, { id: "C1", type: "Company" }],
      [{ id: "e1", source: "P1", target: "C1", type: "employs" }]
    );
    expect(rule.validate(g)).toBe(false);
  });

  it("allows unconstrained edge types", () => {
    const g = makeGraph(
      [{ id: "A", type: "Person" }, { id: "B", type: "Person" }],
      [{ id: "e1", source: "A", target: "B", type: "knows" }]
    );
    expect(rule.validate(g)).toBe(true);
  });
});

describe("acyclicEdgeTypes", () => {
  const rule = acyclicEdgeTypes(["contains"]);

  it("passes acyclic graph for target edge type", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }, { id: "C", type: "X" }],
      [
        { id: "e1", source: "A", target: "B", type: "contains" },
        { id: "e2", source: "B", target: "C", type: "contains" },
      ]
    );
    expect(rule.validate(g)).toBe(true);
  });

  it("fails when target edge type forms a cycle", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }, { id: "C", type: "X" }],
      [
        { id: "e1", source: "A", target: "B", type: "contains" },
        { id: "e2", source: "B", target: "C", type: "contains" },
        { id: "e3", source: "C", target: "A", type: "contains" },
      ]
    );
    expect(rule.validate(g)).toBe(false);
  });

  it("ignores other edge types when checking for cycles", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }],
      [
        { id: "e1", source: "A", target: "B", type: "references" },
        { id: "e2", source: "B", target: "A", type: "references" },
      ]
    );
    // "references" is not in the acyclic check — should pass
    expect(rule.validate(g)).toBe(true);
  });
});

describe("validEdgeEndpoints", () => {
  const rule = validEdgeEndpoints();

  it("passes when all endpoints exist", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }],
      [{ id: "e1", source: "A", target: "B", type: "t" }]
    );
    expect(rule.validate(g)).toBe(true);
  });

  it("fails when source does not exist", () => {
    const g = makeGraph(
      [{ id: "B", type: "X" }],
      [{ id: "e1", source: "MISSING", target: "B", type: "t" }]
    );
    expect(rule.validate(g)).toBe(false);
  });

  it("fails when target does not exist", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }],
      [{ id: "e1", source: "A", target: "MISSING", type: "t" }]
    );
    expect(rule.validate(g)).toBe(false);
  });
});

describe("isConnected", () => {
  const rule = isConnected();

  it("passes a connected graph", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }, { id: "C", type: "X" }],
      [
        { id: "e1", source: "A", target: "B", type: "t" },
        { id: "e2", source: "B", target: "C", type: "t" },
      ]
    );
    expect(rule.validate(g)).toBe(true);
  });

  it("fails a disconnected graph", () => {
    const g = makeGraph(
      [
        { id: "A", type: "X" },
        { id: "B", type: "X" },
        { id: "C", type: "X" }, // C is isolated
      ],
      [{ id: "e1", source: "A", target: "B", type: "t" }]
    );
    expect(rule.validate(g)).toBe(false);
  });

  it("passes empty graph", () => {
    expect(rule.validate(makeGraph([], []))).toBe(true);
  });

  it("passes single-node graph", () => {
    expect(rule.validate(makeGraph([{ id: "A", type: "X" }], []))).toBe(true);
  });
});

describe("uniqueNodeIds", () => {
  const rule = uniqueNodeIds();

  it("passes when all IDs are unique", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }],
      []
    );
    expect(rule.validate(g)).toBe(true);
  });

  it("fails when duplicate node ID exists", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "A", type: "Y" }],
      []
    );
    expect(rule.validate(g)).toBe(false);
  });
});

describe("uniqueEdgeIds", () => {
  const rule = uniqueEdgeIds();

  it("passes when all edge IDs are unique", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }],
      [
        { id: "e1", source: "A", target: "B", type: "t" },
        { id: "e2", source: "B", target: "A", type: "t" },
      ]
    );
    expect(rule.validate(g)).toBe(true);
  });

  it("fails when duplicate edge ID exists", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }],
      [
        { id: "e1", source: "A", target: "B", type: "t" },
        { id: "e1", source: "B", target: "A", type: "t" },
      ]
    );
    expect(rule.validate(g)).toBe(false);
  });
});

describe("maxOutDegree", () => {
  const rule = maxOutDegree(2);

  it("passes when out-degree <= max", () => {
    const g = makeGraph(
      [{ id: "A", type: "X" }, { id: "B", type: "X" }, { id: "C", type: "X" }],
      [
        { id: "e1", source: "A", target: "B", type: "t" },
        { id: "e2", source: "A", target: "C", type: "t" },
      ]
    );
    expect(rule.validate(g)).toBe(true);
  });

  it("fails when out-degree exceeds max", () => {
    const g = makeGraph(
      [
        { id: "A", type: "X" },
        { id: "B", type: "X" },
        { id: "C", type: "X" },
        { id: "D", type: "X" },
      ],
      [
        { id: "e1", source: "A", target: "B", type: "t" },
        { id: "e2", source: "A", target: "C", type: "t" },
        { id: "e3", source: "A", target: "D", type: "t" },
      ]
    );
    expect(rule.validate(g)).toBe(false);
  });
});
