import { EventEmitter } from "node:events";

export type TransactionCreatedEvent = {
  transactionId: string;
  userId: string;
  categoryId: number;
  type: "income" | "expense";
  amount: string;
  txnDate: string;
  source: "recurring" | "manual" | "csv_import";
};

type TransactionSnapshotEvent = {
  transactionId: string;
  userId: string;
  categoryId: number;
  type: "income" | "expense";
  amount: string;
  txnDate: string;
};

export type TransactionUpdatedEvent = {
  before: TransactionSnapshotEvent;
  after: TransactionSnapshotEvent;
};

export type TransactionDeletedEvent = {
  transaction: TransactionSnapshotEvent;
};

export type TransactionRestoredEvent = {
  transaction: TransactionSnapshotEvent;
};

type DomainEvents = {
  "transaction.created": TransactionCreatedEvent;
  "transaction.updated": TransactionUpdatedEvent;
  "transaction.deleted": TransactionDeletedEvent;
  "transaction.restored": TransactionRestoredEvent;
};

class DomainEventBus {
  private readonly emitter = new EventEmitter();

  on<K extends keyof DomainEvents>(
    eventName: K,
    listener: (payload: DomainEvents[K]) => void,
  ): void {
    this.emitter.on(eventName, listener as (payload: unknown) => void);
  }

  emit<K extends keyof DomainEvents>(eventName: K, payload: DomainEvents[K]): void {
    this.emitter.emit(eventName, payload);
  }
}

export const domainEventBus = new DomainEventBus();
