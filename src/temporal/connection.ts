import { Connection, type ConnectionOptions } from "@temporalio/client";
import { NativeConnection, type NativeConnectionOptions } from "@temporalio/worker";

function normalizeTemporalAddress(address: string): string {
  return address.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function buildConnectionOptions(): { address: string } {
  const address = normalizeTemporalAddress(process.env.TEMPORAL_ADDRESS ?? "localhost:7233");
  return { address };
}

export async function createConnection(): Promise<Connection> {
  const opts = buildConnectionOptions();
  return Connection.connect(opts as ConnectionOptions);
}

export async function createNativeConnection(): Promise<NativeConnection> {
  const opts = buildConnectionOptions();
  return NativeConnection.connect(opts as NativeConnectionOptions);
}
