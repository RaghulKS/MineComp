export type RootName = "Desktop" | "Documents" | "Downloads";

export type WorldEntity = {
  id: string;
  kind: "file" | "folder";
  name: string;
  path: string;
  extension?: string;
  parentPath: string | null;
  root: RootName;
  size?: number;
  modifiedAt?: number;
};

export type WorldResponse = { entities: WorldEntity[] };

export type SystemState = { cpu: number; ram: number; timestamp: number };
