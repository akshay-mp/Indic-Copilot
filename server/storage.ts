import { db } from "./db";
import {
  type User, type InsertUser,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type GeneratedApp, type InsertGeneratedApp,
  users, conversations, messages, generatedApps, appStorage,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getConversation(id: number): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(data: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, data: Partial<InsertConversation>): Promise<Conversation | undefined>;
  deleteConversation(id: number): Promise<void>;

  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(data: InsertMessage): Promise<Message>;

  getApp(id: number): Promise<GeneratedApp | undefined>;
  getAllApps(): Promise<GeneratedApp[]>;
  createApp(data: InsertGeneratedApp): Promise<GeneratedApp>;
  deleteApp(id: number): Promise<void>;

  listAppStorage(appId: number, collection: string): Promise<any[]>;
  getAppStorageDoc(appId: number, collection: string, docId: string): Promise<any | undefined>;
  createAppStorageDoc(appId: number, collection: string, docId: string, data: any): Promise<any>;
  updateAppStorageDoc(appId: number, collection: string, docId: string, data: any): Promise<any | undefined>;
  deleteAppStorageDoc(appId: number, collection: string, docId: string): Promise<void>;
  clearAppStorage(appId: number, collection?: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conv;
  }

  async getAllConversations(): Promise<Conversation[]> {
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const [conv] = await db.insert(conversations).values(data).returning();
    return conv;
  }

  async updateConversation(id: number, data: Partial<InsertConversation>): Promise<Conversation | undefined> {
    const [conv] = await db.update(conversations).set(data).where(eq(conversations.id, id)).returning();
    return conv;
  }

  async deleteConversation(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const [msg] = await db.insert(messages).values(data).returning();
    return msg;
  }

  async getApp(id: number): Promise<GeneratedApp | undefined> {
    const [app] = await db.select().from(generatedApps).where(eq(generatedApps.id, id));
    return app;
  }

  async getAllApps(): Promise<GeneratedApp[]> {
    return db.select().from(generatedApps).orderBy(desc(generatedApps.createdAt));
  }

  async createApp(data: InsertGeneratedApp): Promise<GeneratedApp> {
    const [app] = await db.insert(generatedApps).values(data).returning();
    return app;
  }

  async deleteApp(id: number): Promise<void> {
    await db.delete(appStorage).where(eq(appStorage.appId, id));
    await db.delete(generatedApps).where(eq(generatedApps.id, id));
  }

  async listAppStorage(appId: number, collection: string): Promise<any[]> {
    const rows = await db.select().from(appStorage)
      .where(and(eq(appStorage.appId, appId), eq(appStorage.collection, collection)))
      .orderBy(desc(appStorage.createdAt));
    return rows.map(r => ({ id: r.docId, ...JSON.parse(r.data), _createdAt: r.createdAt, _updatedAt: r.updatedAt }));
  }

  async getAppStorageDoc(appId: number, collection: string, docId: string): Promise<any | undefined> {
    const [row] = await db.select().from(appStorage)
      .where(and(eq(appStorage.appId, appId), eq(appStorage.collection, collection), eq(appStorage.docId, docId)));
    if (!row) return undefined;
    return { id: row.docId, ...JSON.parse(row.data), _createdAt: row.createdAt, _updatedAt: row.updatedAt };
  }

  async createAppStorageDoc(appId: number, collection: string, docId: string, data: any): Promise<any> {
    const [row] = await db.insert(appStorage).values({
      appId,
      collection,
      docId,
      data: JSON.stringify(data),
    }).returning();
    return { id: row.docId, ...data, _createdAt: row.createdAt, _updatedAt: row.updatedAt };
  }

  async updateAppStorageDoc(appId: number, collection: string, docId: string, data: any): Promise<any | undefined> {
    const [row] = await db.update(appStorage)
      .set({ data: JSON.stringify(data), updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(appStorage.appId, appId), eq(appStorage.collection, collection), eq(appStorage.docId, docId)))
      .returning();
    if (!row) return undefined;
    return { id: row.docId, ...data, _createdAt: row.createdAt, _updatedAt: row.updatedAt };
  }

  async deleteAppStorageDoc(appId: number, collection: string, docId: string): Promise<void> {
    await db.delete(appStorage)
      .where(and(eq(appStorage.appId, appId), eq(appStorage.collection, collection), eq(appStorage.docId, docId)));
  }

  async clearAppStorage(appId: number, collection?: string): Promise<void> {
    if (collection) {
      await db.delete(appStorage)
        .where(and(eq(appStorage.appId, appId), eq(appStorage.collection, collection)));
    } else {
      await db.delete(appStorage).where(eq(appStorage.appId, appId));
    }
  }
}

export const storage = new DatabaseStorage();
