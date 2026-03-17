// Workflow persistence layer - save/load workflow instances and execution history

import {
  WorkflowInstance,
  WorkflowStatus,
  StepResult,
  WorkflowError,
  WorkflowErrorCode,
} from './types.js';

export interface WorkflowPersistence {
  /** Save a workflow instance (create or update) */
  saveInstance(instance: WorkflowInstance): Promise<void>;

  /** Load a workflow instance by id */
  loadInstance(instanceId: string): Promise<WorkflowInstance | null>;

  /** List instances, optionally filtered by workflowId and/or status */
  listInstances(opts?: {
    workflowId?: string;
    status?: WorkflowStatus;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowInstance[]>;

  /** Append a step result to an instance's history */
  appendHistory(instanceId: string, result: StepResult): Promise<void>;

  /** Load full execution history for an instance */
  loadHistory(instanceId: string): Promise<StepResult[]>;

  /** Delete an instance and its history */
  deleteInstance(instanceId: string): Promise<void>;

  /** Remove instances that completed/failed/cancelled before the given date */
  cleanupBefore(date: Date, statuses?: WorkflowStatus[]): Promise<number>;

  /** Count instances, optionally filtered */
  countInstances(opts?: { workflowId?: string; status?: WorkflowStatus }): Promise<number>;
}

// Serialized form of WorkflowInstance (Maps converted to plain objects for storage)
interface SerializedInstance {
  instance: Omit<WorkflowInstance, 'context'> & {
    context: {
      workflowId: string;
      instanceId: string;
      variables: Record<string, unknown>;
      stepResults: Record<string, unknown>;
      currentStepId?: string;
      triggerPayload?: unknown;
    };
  };
  history: StepResult[];
}

function serializeInstance(instance: WorkflowInstance): SerializedInstance {
  const stepResultsObj: Record<string, unknown> = {};
  for (const [k, v] of instance.context.stepResults) {
    stepResultsObj[k] = v;
  }

  return {
    instance: {
      ...instance,
      context: {
        ...instance.context,
        stepResults: stepResultsObj,
      },
    },
    history: [...instance.history],
  };
}

function deserializeInstance(serialized: SerializedInstance): WorkflowInstance {
  const stepResults = new Map<string, StepResult>();
  for (const [k, v] of Object.entries(serialized.instance.context.stepResults)) {
    stepResults.set(k, v as StepResult);
  }

  return {
    ...serialized.instance,
    history: serialized.history,
    context: {
      ...serialized.instance.context,
      stepResults,
    },
  };
}

export class InMemoryPersistence implements WorkflowPersistence {
  private instances: Map<string, SerializedInstance> = new Map();

  async saveInstance(instance: WorkflowInstance): Promise<void> {
    const serialized = serializeInstance(instance);
    this.instances.set(instance.id, serialized);
  }

  async loadInstance(instanceId: string): Promise<WorkflowInstance | null> {
    const serialized = this.instances.get(instanceId);
    if (!serialized) return null;
    return deserializeInstance(serialized);
  }

  async listInstances(opts?: {
    workflowId?: string;
    status?: WorkflowStatus;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowInstance[]> {
    let results = Array.from(this.instances.values()).map(deserializeInstance);

    if (opts?.workflowId) {
      results = results.filter(i => i.workflowId === opts.workflowId);
    }
    if (opts?.status !== undefined) {
      results = results.filter(i => i.status === opts.status);
    }

    // Sort by createdAt descending
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async appendHistory(instanceId: string, result: StepResult): Promise<void> {
    const serialized = this.instances.get(instanceId);
    if (!serialized) {
      throw new WorkflowError(
        WorkflowErrorCode.WorkflowNotFound,
        `Instance ${instanceId} not found`
      );
    }
    serialized.history.push(result);
  }

  async loadHistory(instanceId: string): Promise<StepResult[]> {
    const serialized = this.instances.get(instanceId);
    if (!serialized) return [];
    return [...serialized.history];
  }

  async deleteInstance(instanceId: string): Promise<void> {
    this.instances.delete(instanceId);
  }

  async cleanupBefore(
    date: Date,
    statuses: WorkflowStatus[] = [
      WorkflowStatus.Completed,
      WorkflowStatus.Failed,
      WorkflowStatus.Cancelled,
    ]
  ): Promise<number> {
    let count = 0;
    for (const [id, serialized] of this.instances) {
      const inst = serialized.instance;
      if (
        statuses.includes(inst.status) &&
        inst.updatedAt < date
      ) {
        this.instances.delete(id);
        count++;
      }
    }
    return count;
  }

  async countInstances(opts?: {
    workflowId?: string;
    status?: WorkflowStatus;
  }): Promise<number> {
    let count = 0;
    for (const serialized of this.instances.values()) {
      const inst = serialized.instance;
      if (opts?.workflowId && inst.workflowId !== opts.workflowId) continue;
      if (opts?.status !== undefined && inst.status !== opts.status) continue;
      count++;
    }
    return count;
  }

  /** Get raw instance count (for testing) */
  size(): number {
    return this.instances.size;
  }

  /** Clear all data (for testing) */
  clear(): void {
    this.instances.clear();
  }
}
