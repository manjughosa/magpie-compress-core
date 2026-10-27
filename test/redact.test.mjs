// test/redact.test.mjs — a capture is the one place the whole conversation is
// written out, so credentials in it must be masked before they reach disk.
import { check } from "./helpers.mjs"
import { redact, redactSecrets } from "../telemetry-store.js"

export const name = "redact"

export async function run() {
  const openai = redactSecrets("use sk-proj-AbCdEf1234567890AbCdEf1234567890 for this")
  check("an OpenAI key is masked", openai.includes("[redacted:key]") && !openai.includes("AbCdEf1234567890AbCdEf1234567890"), openai)

  const gh = redactSecrets("token ghp_AbCdEf1234567890AbCdEf1234567890xyz done")
  check("a GitHub token is masked", gh.includes("[redacted:github-token]") && !gh.includes("ghp_AbCd"), gh)

  const aws = redactSecrets("aws AKIAIOSFODNN7EXAMPLE pair")
  check("an AWS access key is masked", aws.includes("[redacted:aws-key]") && !aws.includes("AKIAIOSFODNN7EXAMPLE"), aws)

  const jwt = redactSecrets("cookie eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U")
  check("a JWT is masked", jwt.includes("[redacted:jwt]") && !jwt.includes("eyJhbGciOiJIUzI1NiJ9"), jwt)

  const bearer = redactSecrets("Authorization: Bearer abcd1234efgh5678ijkl")
  check("a bearer credential is masked", bearer.includes("[redacted:credential]") && !bearer.includes("abcd1234efgh5678ijkl"), bearer)

  const pem = redactSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIEogIBAAKCAQEA\n-----END RSA PRIVATE KEY-----")
  check("a private key block is masked whole", pem.includes("[redacted:private-key]") && !pem.includes("MIIEogIBAAKCAQEA"), pem)

  const field = redactSecrets('{"api_key": "hunter2hunter2", "note": "kept"}')
  check("a credential field keeps its name and loses its value", field.includes("api_key") && !field.includes("hunter2") && field.includes("kept"), field)

  // Ordinary prose must survive: a capture is worthless if it redacts the talk.
  const prose = "the token count is 1200 and the key insight is small"
  check("prose about tokens and keys is left alone", redactSecrets(prose) === prose, redactSecrets(prose))

  const code = 'const taskId = "abc-123"; const maxTokens = 2000'
  check("ordinary code is left alone", redactSecrets(code) === code, redactSecrets(code))

  // A capture keeps whole text; the telemetry sample keeps a 1600-char slice.
  const long = "x".repeat(3000)
  check("redactSecrets does not truncate", redactSecrets(long).length === 3000)
  check("redact still caps a telemetry sample", redact(long).length === 1600)

  const contact = redact("write to someone@example.com about C:\\Users\\someone\\notes.txt")
  check("redact still masks an email and a path", contact.includes("[email]") && contact.includes("[path]"), contact)
}
