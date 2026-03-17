import type { Graph } from "../graph.js";
import type { Community } from "../types.js";

/**
 * Label Propagation Algorithm for community detection.
 * Each node adopts the most frequent label among its neighbors.
 */
export function communityDetection(
  graph: Graph,
  maxIterations = 100,
): Community[] {
  const nodes = graph.getAllNodes();

  if (nodes.length === 0) return [];

  // Initialize: each node is its own community
  const labels = new Map<string, number>();
  nodes.forEach((node, i) => labels.set(node.id, i));

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Shuffle nodes for randomized processing
    const shuffled = [...nodes].sort(() => Math.random() - 0.5);

    for (const node of shuffled) {
      const neighbors = graph.getNeighbors(node.id, "both");
      if (neighbors.length === 0) continue;

      // Count label frequencies among neighbors
      const freq = new Map<number, number>();
      for (const neighborId of neighbors) {
        const label = labels.get(neighborId)!;
        freq.set(label, (freq.get(label) ?? 0) + 1);
      }

      // Find most frequent label
      let maxFreq = 0;
      let bestLabel = labels.get(node.id)!;
      for (const [label, count] of freq) {
        if (count > maxFreq) {
          maxFreq = count;
          bestLabel = label;
        }
      }

      if (bestLabel !== labels.get(node.id)) {
        labels.set(node.id, bestLabel);
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Group nodes by label
  const communities = new Map<number, string[]>();
  for (const [nodeId, label] of labels) {
    const members = communities.get(label) ?? [];
    members.push(nodeId);
    communities.set(label, members);
  }

  // Calculate modularity for each community
  const totalEdges = graph.edgeCount;

  return Array.from(communities.entries()).map(([id, members]) => {
    const memberSet = new Set(members);
    let internalEdges = 0;
    let totalDegree = 0;

    for (const nodeId of members) {
      const neighbors = graph.getNeighbors(nodeId, "both");
      totalDegree += neighbors.length;
      for (const neighborId of neighbors) {
        if (memberSet.has(neighborId)) {
          internalEdges++;
        }
      }
    }

    // Modularity contribution of this community
    const m2 = totalEdges * 2 || 1;
    const modularity = internalEdges / m2 - (totalDegree / m2) ** 2;

    return { id, members, modularity };
  });
}
