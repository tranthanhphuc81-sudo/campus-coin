#!/usr/bin/env node
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

process.stdout.write(
  'JWT_PRIVATE_KEY="' +
    privateKey
      .export({ type: "pkcs8", format: "pem" })
      .replaceAll("\n", "\\n") +
    '"\n',
);
process.stdout.write(
  'JWT_PUBLIC_KEY="' +
    publicKey.export({ type: "spki", format: "pem" }).replaceAll("\n", "\\n") +
    '"\n',
);
