import { scalars } from "../../scalars.js";
import { nodeQueryResolvers, nodeMutationResolvers, nodeFieldResolvers } from "./node-resolvers.js";
import { edgeQueryResolvers, edgeMutationResolvers, edgeFieldResolvers } from "./edge-resolvers.js";
import { userQueryResolvers, userMutationResolvers, userFieldResolvers } from "./user-resolvers.js";
import { graphQueryResolvers } from "./graph-resolvers.js";
import { searchQueryResolvers } from "./search-resolvers.js";

export const resolvers = {
  // Custom scalars
  DateTime: scalars.DateTime,
  JSON: scalars.JSON,
  UUID: scalars.UUID,

  Query: {
    ...nodeQueryResolvers,
    ...edgeQueryResolvers,
    ...userQueryResolvers,
    ...graphQueryResolvers,
    ...searchQueryResolvers,
  },

  Mutation: {
    ...nodeMutationResolvers,
    ...edgeMutationResolvers,
    ...userMutationResolvers,
  },

  // Field resolvers
  ...nodeFieldResolvers,
  ...edgeFieldResolvers,
  ...userFieldResolvers,
};
