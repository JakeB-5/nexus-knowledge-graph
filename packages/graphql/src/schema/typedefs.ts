import { gql } from "graphql-tag";

export const typeDefs = gql`
  scalar DateTime
  scalar JSON
  scalar UUID

  directive @auth on FIELD_DEFINITION | OBJECT
  directive @requireRole(role: UserRole!) on FIELD_DEFINITION

  # ─── Enums ────────────────────────────────────────────────────────────────────

  enum NodeType {
    document
    concept
    tag
    person
    organization
    event
    location
    resource
  }

  enum EdgeType {
    references
    contains
    related_to
    created_by
    tagged_with
    belongs_to
    depends_on
    derived_from
    mentions
    collaborates_with
  }

  enum UserRole {
    admin
    editor
    viewer
  }

  enum TraversalMode {
    BFS
    DFS
  }

  enum TraversalDirection {
    outgoing
    incoming
    both
  }

  enum SortOrder {
    asc
    desc
  }

  # ─── Relay-style Pagination ───────────────────────────────────────────────────

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type NodeEdgeConnection {
    edges: [NodeEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type NodeEdge {
    cursor: String!
    node: Node!
  }

  type EdgeConnection {
    edges: [EdgeCursor!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type EdgeCursor {
    cursor: String!
    node: Edge!
  }

  type UserConnection {
    edges: [UserEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type UserEdge {
    cursor: String!
    node: User!
  }

  # ─── Core Types ───────────────────────────────────────────────────────────────

  type Node {
    id: UUID!
    type: NodeType!
    title: String!
    content: String
    metadata: JSON!
    ownerId: UUID!
    owner: User! @auth
    outgoingEdges: [Edge!]!
    incomingEdges: [Edge!]!
    connectionCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Edge {
    id: UUID!
    type: EdgeType!
    sourceId: UUID!
    targetId: UUID!
    weight: Float!
    metadata: JSON!
    source: Node!
    target: Node!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type User {
    id: UUID!
    email: String! @auth
    name: String!
    role: UserRole!
    avatarUrl: String
    nodes: [Node!]!
    nodeCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ─── Graph Analysis Types ─────────────────────────────────────────────────────

  type TraversalResult {
    nodes: [Node!]!
    paths: [TraversalPath!]!
    totalVisited: Int!
  }

  type TraversalPath {
    nodeId: UUID!
    path: [UUID!]!
    depth: Int!
  }

  type ShortestPathResult {
    path: [Node!]
    length: Int
    found: Boolean!
  }

  type PageRankEntry {
    node: Node!
    score: Float!
    rank: Int!
  }

  type Community {
    id: Int!
    members: [Node!]!
    size: Int!
    modularity: Float!
  }

  type GraphStats {
    nodeCount: Int!
    edgeCount: Int!
    density: Float!
    averageDegree: Float!
    connectedComponents: Int!
  }

  # ─── Search Types ─────────────────────────────────────────────────────────────

  type SearchResult {
    node: Node!
    score: Float!
    highlights: [String!]!
  }

  type SearchResponse {
    results: [SearchResult!]!
    total: Int!
    query: String!
    took: Int!
  }

  type Suggestion {
    text: String!
    nodeId: UUID
    type: NodeType
  }

  # ─── Input Types ──────────────────────────────────────────────────────────────

  input CreateNodeInput {
    type: NodeType!
    title: String!
    content: String
    metadata: JSON
    ownerId: UUID!
  }

  input UpdateNodeInput {
    type: NodeType
    title: String
    content: String
    metadata: JSON
  }

  input CreateEdgeInput {
    type: EdgeType!
    sourceId: UUID!
    targetId: UUID!
    weight: Float
    metadata: JSON
  }

  input CreateUserInput {
    email: String!
    name: String!
    password: String!
    role: UserRole
  }

  input UpdateUserInput {
    name: String
    role: UserRole
    avatarUrl: String
  }

  input TraversalInput {
    startNodeId: UUID!
    mode: TraversalMode!
    direction: TraversalDirection
    maxDepth: Int
    maxNodes: Int
    edgeTypes: [EdgeType!]
  }

  input SearchInput {
    query: String!
    nodeTypes: [NodeType!]
    limit: Int
    offset: Int
    semantic: Boolean
  }

  input NodeFilterInput {
    type: NodeType
    ownerId: UUID
    search: String
  }

  input EdgeFilterInput {
    type: EdgeType
    sourceId: UUID
    targetId: UUID
  }

  input PaginationInput {
    first: Int
    after: String
    last: Int
    before: String
  }

  # ─── Queries ──────────────────────────────────────────────────────────────────

  type Query {
    # Node queries
    node(id: UUID!): Node
    nodes(
      filter: NodeFilterInput
      pagination: PaginationInput
      sortOrder: SortOrder
    ): NodeEdgeConnection!

    # Edge queries
    edge(id: UUID!): Edge
    edges(
      filter: EdgeFilterInput
      pagination: PaginationInput
    ): EdgeConnection!

    # User queries
    user(id: UUID!): User @auth
    users(pagination: PaginationInput): UserConnection! @requireRole(role: admin)
    me: User @auth

    # Graph analysis
    traverse(input: TraversalInput!): TraversalResult!
    shortestPath(sourceId: UUID!, targetId: UUID!, direction: TraversalDirection): ShortestPathResult!
    pageRank(topN: Int, dampingFactor: Float): [PageRankEntry!]!
    communities(resolution: Float): [Community!]!
    graphStats: GraphStats!

    # Search
    search(input: SearchInput!): SearchResponse!
    suggest(prefix: String!, limit: Int): [Suggestion!]!
  }

  # ─── Mutations ────────────────────────────────────────────────────────────────

  type Mutation {
    # Node mutations
    createNode(input: CreateNodeInput!): Node! @auth
    updateNode(id: UUID!, input: UpdateNodeInput!): Node! @auth
    deleteNode(id: UUID!): Boolean! @auth

    # Edge mutations
    createEdge(input: CreateEdgeInput!): Edge! @auth
    deleteEdge(id: UUID!): Boolean! @auth

    # User mutations
    createUser(input: CreateUserInput!): User!
    updateUser(id: UUID!, input: UpdateUserInput!): User! @auth
  }

  # ─── Subscriptions ────────────────────────────────────────────────────────────

  type Subscription {
    nodeUpdated(nodeId: UUID): Node!
    edgeCreated(nodeId: UUID): Edge!
    presenceChanged(nodeId: UUID!): PresenceEvent!
  }

  type PresenceEvent {
    userId: UUID!
    nodeId: UUID!
    action: PresenceAction!
    timestamp: DateTime!
  }

  enum PresenceAction {
    joined
    left
    moved
  }
`;
