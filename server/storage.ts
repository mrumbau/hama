
import { criminals, alerts, type Criminal, type InsertCriminal, type Alert, type InsertAlert } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getCriminals(): Promise<Criminal[]>;
  getCriminal(id: number): Promise<Criminal | undefined>;
  createCriminal(criminal: InsertCriminal): Promise<Criminal>;
  deleteCriminal(id: number): Promise<void>;

  getAlerts(): Promise<Alert[]>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  updateAlertStatus(id: number, status: string): Promise<Alert | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getCriminals(): Promise<Criminal[]> {
    return await db.select().from(criminals).orderBy(desc(criminals.createdAt));
  }

  async getCriminal(id: number): Promise<Criminal | undefined> {
    const [criminal] = await db.select().from(criminals).where(eq(criminals.id, id));
    return criminal;
  }

  async createCriminal(insertCriminal: InsertCriminal): Promise<Criminal> {
    const [criminal] = await db.insert(criminals).values(insertCriminal).returning();
    return criminal;
  }

  async deleteCriminal(id: number): Promise<void> {
    // First delete any associated alerts to avoid foreign key constraint errors
    await db.delete(alerts).where(eq(alerts.criminalId, id));
    // Then delete the criminal record
    await db.delete(criminals).where(eq(criminals.id, id));
  }

  async getAlerts(): Promise<Alert[]> {
    return await db.select().from(alerts).orderBy(desc(alerts.timestamp));
  }

  async createAlert(insertAlert: InsertAlert): Promise<Alert> {
    const [alert] = await db.insert(alerts).values(insertAlert).returning();
    return alert;
  }

  async updateAlertStatus(id: number, status: string): Promise<Alert | undefined> {
    const [alert] = await db.update(alerts)
      .set({ status })
      .where(eq(alerts.id, id))
      .returning();
    return alert;
  }
}

export const storage = new DatabaseStorage();
