// Pre-built workflow templates for common Nexus automation patterns

import { WorkflowDefinition, StepType, TriggerType } from './types.js';
import { createWorkflow } from './builder.js';

// -------------------------------------------------------------------------
// AutoTagWorkflow: on node create → extract keywords → create tag edges
// -------------------------------------------------------------------------
export function createAutoTagWorkflow(): WorkflowDefinition {
  return createWorkflow('Auto Tag Workflow')
    .id('auto-tag-workflow')
    .description('When a node is created, extract keywords from its content and create tag edges')
    .version(1)
    .eventTrigger('node.created', undefined, 'trigger-node-created')
    .tags('auto', 'tagging', 'nlp')
    .action(
      'Extract node content',
      'set_variable',
      {
        name: 'nodeId',
        value: '$.payload.nodeId',
      }
    )
    .action(
      'Extract keywords',
      'extract_keywords',
      {
        text: '$.payload.content',
        maxKeywords: 10,
      }
    )
    .loop(
      '$.extract_keywords.output.keywords',
      (b) =>
        b
          .action(
            'Create tag node',
            'create_node',
            {
              type: 'tag',
              properties: {
                name: '{{$.item}}',
                source: 'auto-tag',
              },
            }
          )
          .action(
            'Create tag edge',
            'create_edge',
            {
              fromId: '$.nodeId',
              toId: '$.create_tag_node.output.nodeId',
              edgeType: 'tagged_with',
              properties: { confidence: 0.8 },
            }
          ),
      {
        itemVariable: 'item',
        name: 'Create tag edges',
        maxIterations: 20,
        accumulator: 'createdTags',
      }
    )
    .action(
      'Notify completion',
      'send_notification',
      {
        recipient: 'system',
        channel: 'workflow',
        message: 'Auto-tagging complete: {{length($.createdTags)}} tags added to node {{$.nodeId}}',
      }
    )
    .build();
}

// -------------------------------------------------------------------------
// LinkCheckerWorkflow: find all URL nodes → check if alive → mark dead links
// -------------------------------------------------------------------------
export function createLinkCheckerWorkflow(): WorkflowDefinition {
  return createWorkflow('Link Checker Workflow')
    .id('link-checker-workflow')
    .description('Periodically find URL nodes, check if they are alive, and mark dead links')
    .version(1)
    .scheduleTrigger('0 2 * * *', 'UTC', 'trigger-daily-2am') // Daily at 2am
    .tags('maintenance', 'links', 'health-check')
    .action(
      'Find URL nodes',
      'run_search',
      {
        query: 'type:url',
        limit: 500,
      }
    )
    .loop(
      '$.find_url_nodes.output.results',
      (b) =>
        b
          .action(
            'Check link health',
            'http_request',
            {
              url: '{{$.item.properties.url}}',
              method: 'GET',
              timeoutMs: 10000,
            }
          )
          .condition(
            {
              type: 'simple',
              left: '$.check_link_health.output.ok',
              operator: 'eq',
              right: false,
            },
            'Is link dead?'
          )
          .then((tb) =>
            tb
              .action(
                'Mark as dead link',
                'update_node',
                {
                  nodeId: '{{$.item.id}}',
                  properties: {
                    status: 'dead',
                    lastChecked: '{{now()}}',
                    httpStatus: '{{$.check_link_health.output.status}}',
                  },
                }
              )
              .action(
                'Notify dead link',
                'send_notification',
                {
                  recipient: '{{$.item.ownerId}}',
                  channel: 'email',
                  message: 'Dead link detected: {{$.item.properties.url}} returned HTTP {{$.check_link_health.output.status}}',
                }
              )
          )
          .else((eb) =>
            eb.action(
              'Mark as alive',
              'update_node',
              {
                nodeId: '{{$.item.id}}',
                properties: {
                  status: 'alive',
                  lastChecked: '{{now()}}',
                },
              }
            )
          )
          .end(),
      {
        itemVariable: 'item',
        name: 'Check each URL',
        maxIterations: 500,
        accumulator: 'checkedLinks',
      }
    )
    .action(
      'Summary notification',
      'send_notification',
      {
        recipient: 'admin',
        channel: 'slack',
        message: 'Link check complete: {{length($.checkedLinks)}} links checked',
      }
    )
    .build();
}

// -------------------------------------------------------------------------
// DigestWorkflow: daily → collect new nodes → generate summary → send notification
// -------------------------------------------------------------------------
export function createDigestWorkflow(): WorkflowDefinition {
  return createWorkflow('Daily Digest Workflow')
    .id('digest-workflow')
    .description('Daily digest: collect new nodes from the past 24 hours and send a summary notification')
    .version(1)
    .scheduleTrigger('0 9 * * 1-5', 'UTC', 'trigger-weekday-9am') // Weekdays at 9am
    .tags('digest', 'notification', 'daily')
    .action(
      'Set time window',
      'set_variable',
      {
        name: 'sinceTimestamp',
        value: '{{now()}}',
      }
    )
    .action(
      'Collect new nodes',
      'run_search',
      {
        query: 'created:>24h',
        limit: 100,
      }
    )
    .condition(
      {
        type: 'simple',
        left: '$.collect_new_nodes.output.total',
        operator: 'gt',
        right: 0,
      },
      'Any new nodes?'
    )
    .then((b) =>
      b
        .action(
          'Extract keywords from new nodes',
          'extract_keywords',
          {
            text: '$.collect_new_nodes.output.results',
            maxKeywords: 20,
          }
        )
        .action(
          'Send digest notification',
          'send_notification',
          {
            recipient: 'subscribers',
            channel: 'email',
            message: '📊 Daily Digest: {{$.collect_new_nodes.output.total}} new nodes added today. Top topics: {{join($.extract_keywords.output.keywords, ", ")}}',
            data: {
              nodeCount: '$.collect_new_nodes.output.total',
              topKeywords: '$.extract_keywords.output.keywords',
              generatedAt: '{{now()}}',
            },
          }
        )
    )
    .else((b) =>
      b.action(
        'Log no new content',
        'log',
        {
          level: 'info',
          message: 'Daily digest: no new nodes in the past 24 hours',
        }
      )
    )
    .end()
    .build();
}

// -------------------------------------------------------------------------
// ImportWorkflow: triggered by webhook → download file → parse → import nodes
// -------------------------------------------------------------------------
export function createImportWorkflow(): WorkflowDefinition {
  return createWorkflow('Import Workflow')
    .id('import-workflow')
    .description('Triggered by webhook: download a file, parse it, and import nodes into the knowledge graph')
    .version(1)
    .webhookTrigger('/webhooks/import', undefined, 'POST', 'trigger-import-webhook')
    .tags('import', 'ingestion', 'webhook')
    .action(
      'Validate import request',
      'set_variable',
      {
        name: 'importUrl',
        value: '$.payload.url',
      }
    )
    .condition(
      {
        type: 'simple',
        left: '$.importUrl',
        operator: 'ne',
        right: null,
      },
      'Has import URL?'
    )
    .then((b) =>
      b
        .action(
          'Download file',
          'http_request',
          {
            url: '{{$.importUrl}}',
            method: 'GET',
          }
        )
        .action(
          'Log download success',
          'log',
          {
            level: 'info',
            message: 'File downloaded from {{$.importUrl}}, size: {{length($.download_file.output.body)}} chars',
          }
        )
        .action(
          'Extract keywords from content',
          'extract_keywords',
          {
            text: '$.download_file.output.body',
            maxKeywords: 50,
          }
        )
        .loop(
          '$.extract_keywords.output.keywords',
          (lb) =>
            lb.action(
              'Create keyword node',
              'create_node',
              {
                type: 'keyword',
                properties: {
                  name: '{{$.item}}',
                  importedFrom: '{{$.importUrl}}',
                  importedAt: '{{now()}}',
                },
              }
            ),
          {
            itemVariable: 'item',
            name: 'Import keyword nodes',
            maxIterations: 100,
            accumulator: 'importedNodes',
          }
        )
        .action(
          'Create import summary node',
          'create_node',
          {
            type: 'import_summary',
            properties: {
              sourceUrl: '{{$.importUrl}}',
              nodeCount: '{{length($.importedNodes)}}',
              importedAt: '{{now()}}',
              requestedBy: '$.payload.requestedBy',
            },
          }
        )
        .action(
          'Notify import complete',
          'send_notification',
          {
            recipient: '$.payload.requestedBy',
            channel: 'email',
            message: 'Import complete: {{length($.importedNodes)}} nodes imported from {{$.importUrl}}',
          }
        )
    )
    .else((b) =>
      b
        .action(
          'Log invalid request',
          'log',
          {
            level: 'warn',
            message: 'Import webhook received without URL in payload',
          }
        )
        .action(
          'Notify error',
          'send_notification',
          {
            recipient: '$.payload.requestedBy',
            channel: 'email',
            message: 'Import failed: no URL provided in the request',
          }
        )
    )
    .end()
    .build();
}

// -------------------------------------------------------------------------
// CleanupWorkflow: weekly → find orphan nodes → notify owner → delete if no response
// -------------------------------------------------------------------------
export function createCleanupWorkflow(): WorkflowDefinition {
  return createWorkflow('Cleanup Workflow')
    .id('cleanup-workflow')
    .description('Weekly cleanup: find orphan nodes, notify owners, and delete if no response within the grace period')
    .version(1)
    .scheduleTrigger('0 3 * * 0', 'UTC', 'trigger-weekly-sunday-3am') // Sundays at 3am
    .tags('cleanup', 'maintenance', 'orphans')
    .action(
      'Find orphan nodes',
      'run_search',
      {
        query: 'edges:0 created:<30d',
        limit: 200,
      }
    )
    .condition(
      {
        type: 'simple',
        left: '$.find_orphan_nodes.output.total',
        operator: 'gt',
        right: 0,
      },
      'Any orphan nodes?'
    )
    .then((b) =>
      b
        .loop(
          '$.find_orphan_nodes.output.results',
          (lb) =>
            lb
              .action(
                'Notify node owner',
                'send_notification',
                {
                  recipient: '{{$.item.ownerId}}',
                  channel: 'email',
                  message: 'Your node "{{$.item.properties.title}}" (ID: {{$.item.id}}) has no connections and will be deleted in 7 days unless you add connections or respond to this email.',
                  data: {
                    nodeId: '{{$.item.id}}',
                    nodeTitle: '{{$.item.properties.title}}',
                    gracePeriodDays: 7,
                  },
                }
              )
              .action(
                'Mark as pending deletion',
                'update_node',
                {
                  nodeId: '{{$.item.id}}',
                  properties: {
                    deletionStatus: 'pending',
                    notifiedAt: '{{now()}}',
                    scheduledDeletion: '{{now()}}',
                  },
                }
              ),
          {
            itemVariable: 'item',
            name: 'Process orphan nodes',
            maxIterations: 200,
            accumulator: 'notifiedNodes',
          }
        )
        .delay(7 * 24 * 60 * 60 * 1000, 'Grace period delay') // 7 days (capped at 5min in engine for safety)
        .action(
          'Find still-pending nodes',
          'run_search',
          {
            query: 'properties.deletionStatus:pending',
            limit: 200,
          }
        )
        .loop(
          '$.find_still_pending_nodes.output.results',
          (lb) =>
            lb
              .action(
                'Delete orphan node',
                'delete_node',
                {
                  nodeId: '{{$.item.id}}',
                }
              )
              .action(
                'Notify deletion',
                'send_notification',
                {
                  recipient: '{{$.item.ownerId}}',
                  channel: 'email',
                  message: 'Your node "{{$.item.properties.title}}" has been deleted as it had no connections and the grace period expired.',
                }
              ),
          {
            itemVariable: 'item',
            name: 'Delete pending nodes',
            maxIterations: 200,
            accumulator: 'deletedNodes',
          }
        )
        .action(
          'Cleanup summary',
          'send_notification',
          {
            recipient: 'admin',
            channel: 'slack',
            message: 'Weekly cleanup complete: {{length($.notifiedNodes)}} nodes notified, {{length($.deletedNodes)}} nodes deleted',
          }
        )
    )
    .else((b) =>
      b.action(
        'Log no orphans',
        'log',
        {
          level: 'info',
          message: 'Weekly cleanup: no orphan nodes found',
        }
      )
    )
    .end()
    .build();
}

// -------------------------------------------------------------------------
// Exports
// -------------------------------------------------------------------------

export const WorkflowTemplates = {
  AutoTag: createAutoTagWorkflow,
  LinkChecker: createLinkCheckerWorkflow,
  Digest: createDigestWorkflow,
  Import: createImportWorkflow,
  Cleanup: createCleanupWorkflow,
} as const;

export type TemplateName = keyof typeof WorkflowTemplates;

export function getTemplate(name: TemplateName): WorkflowDefinition {
  return WorkflowTemplates[name]();
}

export function getAllTemplates(): WorkflowDefinition[] {
  return Object.values(WorkflowTemplates).map(factory => factory());
}
