#!/usr/bin/env node
import { Command } from "commander";
import { nodeCommands } from "./commands/nodes.js";
import { searchCommands } from "./commands/search.js";
import { authCommands } from "./commands/auth.js";
import { graphCommands } from "./commands/graph.js";

const program = new Command();

program
  .name("nexus")
  .description("Nexus Knowledge Graph CLI")
  .version("0.1.0");

program.addCommand(nodeCommands);
program.addCommand(searchCommands);
program.addCommand(authCommands);
program.addCommand(graphCommands);

program.parse();
