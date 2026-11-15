// Builds a PostgreSQL SCRAM-SHA-256 verifier locally, so a plain worker
// credential never reaches the database. Shared by the local worker wrapper
// and the hosted worker login command.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

export function createScramVerifier(password) {
  const iterations = 4096;
  const salt = randomBytes(16);
  const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", saltedPassword)
    .update("Client Key")
    .digest();
  const storedKey = createHash("sha256").update(clientKey).digest("base64");
  const serverKey = createHmac("sha256", saltedPassword)
    .update("Server Key")
    .digest("base64");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey}:${serverKey}`;
}
