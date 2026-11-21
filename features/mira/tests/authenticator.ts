import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";

/**
 * A software passkey for the tests: a P-256 key pair that answers WebAuthn ceremonies the way a
 * phone or laptop does (attestation "none"), so the route's checks run against real signatures
 * through the real @simplewebauthn/server. Every part a browser or authenticator controls can be
 * bent: origin, RP ID, flags (user present / verified, synced), counter, user handle.
 */
const b64 = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest();
const UP = 0x01;
const UV = 0x04;
const BE = 0x08;
const BS = 0x10;
const AT = 0x40;

export type Options = { challenge: string; rpId?: string; rp?: { id: string } };
export type Bend = {
  origin?: string;
  rpId?: string;
  verified?: boolean;
  counter?: number;
  userHandle?: string;
  type?: string;
};

export function softwarePasskey(userHandle: string, origin = "https://www.loveiq.org") {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const id = randomBytes(32);
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const cose = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x, "base64url")],
      [-3, Buffer.from(jwk.y, "base64url")],
    ])
  );
  const clientData = (type: string, challenge: string, bend: Bend) =>
    Buffer.from(
      JSON.stringify({
        type: bend.type ?? type,
        challenge,
        origin: bend.origin ?? origin,
        crossOrigin: false,
      })
    );
  const authData = (rpId: string, bend: Bend, extra?: Uint8Array) => {
    const flags = UP | (bend.verified === false ? 0 : UV) | BE | BS | (extra ? AT : 0);
    const count = Buffer.alloc(4);
    count.writeUInt32BE(bend.counter ?? 0); // synced passkeys report 0, like iCloud's
    return Buffer.concat([
      sha256(bend.rpId ?? rpId),
      Buffer.from([flags]),
      count,
      ...(extra ? [extra] : []),
    ]);
  };

  return {
    id: b64(id),
    /** navigator.credentials.create(), as @simplewebauthn/browser hands it over. */
    create(options: { challenge: string; rp: { id: string } }, bend: Bend = {}) {
      const idLength = Buffer.alloc(2);
      idLength.writeUInt16BE(id.length);
      const attested = Buffer.concat([Buffer.alloc(16), idLength, id, Buffer.from(cose)]);
      const attestationObject = isoCBOR.encode(
        new Map<string, unknown>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authData(options.rp.id, bend, attested)],
        ]) as never
      );
      return {
        id: b64(id),
        rawId: b64(id),
        type: "public-key",
        authenticatorAttachment: "platform",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(clientData("webauthn.create", options.challenge, bend)),
          attestationObject: b64(attestationObject),
          transports: ["internal", "hybrid"],
        },
      };
    },
    /** navigator.credentials.get(): signs the challenge (counter 0 unless bent). */
    get(options: { challenge: string; rpId: string }, bend: Bend = {}) {
      const data = authData(options.rpId, bend);
      const client = clientData("webauthn.get", options.challenge, bend);
      const signature = sign(
        "sha256",
        Buffer.concat([data, sha256(client)]),
        privateKey as KeyObject
      );
      return {
        id: b64(id),
        rawId: b64(id),
        type: "public-key",
        authenticatorAttachment: "platform",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(client),
          authenticatorData: b64(data),
          signature: b64(signature),
          userHandle: bend.userHandle ?? userHandle,
        },
      };
    },
  };
}
