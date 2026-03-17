import { Command } from "commander";
import chalk from "chalk";
import { NexusClient } from "@nexus/sdk";
import { getApiUrl, saveConfig } from "../config.js";

export const authCommands = new Command("auth")
  .description("Authentication commands");

authCommands
  .command("login")
  .description("Log in to Nexus")
  .requiredOption("-e, --email <email>", "Email address")
  .requiredOption("-p, --password <password>", "Password")
  .action(async (opts) => {
    try {
      const client = new NexusClient({ baseUrl: getApiUrl() });
      const result = await client.login(opts.email, opts.password);

      saveConfig({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });

      console.log(chalk.green(`Logged in as ${result.user.name} (${result.user.email})`));
    } catch (err) {
      console.error(chalk.red(`Login failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

authCommands
  .command("logout")
  .description("Log out of Nexus")
  .action(() => {
    saveConfig({ accessToken: undefined, refreshToken: undefined });
    console.log(chalk.green("Logged out."));
  });

authCommands
  .command("register")
  .description("Create a new account")
  .requiredOption("-e, --email <email>", "Email address")
  .requiredOption("-p, --password <password>", "Password")
  .requiredOption("-n, --name <name>", "Display name")
  .action(async (opts) => {
    try {
      const client = new NexusClient({ baseUrl: getApiUrl() });
      const result = await client.register({
        email: opts.email,
        password: opts.password,
        name: opts.name,
      });

      saveConfig({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });

      console.log(chalk.green(`Account created. Welcome, ${result.user.name}!`));
    } catch (err) {
      console.error(chalk.red(`Registration failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });
