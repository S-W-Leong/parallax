# Parallax Architecture

![Vercel Next.js app and functions](https://img.shields.io/badge/Vercel-Next.js%20App%20%2B%20Functions-000000?logo=vercel&logoColor=white)
![AWS DynamoDB](https://img.shields.io/badge/AWS-DynamoDB-4053D6?logo=amazondynamodb&logoColor=white)
![AWS S3](https://img.shields.io/badge/AWS-S3-569A31?logo=amazons3&logoColor=white)
![AWS IAM](https://img.shields.io/badge/AWS-IAM-FF9900?logo=amazonaws&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-Agents%20SDK-412991?logo=openai&logoColor=white)

Parallax is a chat-first STEM learning app. A single OpenAI Agents SDK agent handles normal conversation, creates sandboxed Three.js artifacts when useful, and controls the active learning room through tools.

Parallax is deployed as a Next.js app on Vercel. The browser talks only to Vercel-hosted API routes; AWS credentials stay server-side in Vercel environment variables. DynamoDB stores chat thread state and artifact metadata, while S3 stores generated artifact payloads.

## Product Flow

```mermaid
flowchart TD
  A["App opens"] --> B["Read or create demoUserId in localStorage"]
  B --> C["GET /api/threads?userId=..."]
  C --> D{"Any persisted threads?"}
  D -- no --> E["POST /api/threads"]
  D -- yes --> F["Load newest thread"]
  E --> F
  F --> G["GET /api/threads/:threadId?userId=..."]
  G --> H["Hydrate LearningSession from DynamoDB + S3"]
  H --> I["Threaded chat UI with sidebar"]

  I --> J["Create, select, or archive thread"]
  J --> K["/api/threads routes"]
  K --> L["DynamoDB thread summaries"]
  L --> I

  I --> M["User sends chat message"]
  M --> N["POST /api/agent mode: chat with userId + threadId"]
  N --> O["Parallax Agent"]
  O -- normal chat --> P["Persist user + assistant messages in DynamoDB"]
  P --> Q["Assistant reply in active thread"]
  O -- artifact needed --> R["create_experience tool"]
  R --> S["Static artifact validation"]
  S -- invalid --> T["Persist/display validation error"]
  S -- valid --> U["Upload artifact HTML + sceneSource to S3"]
  U --> V["Persist artifact metadata + assistant message in DynamoDB"]
  V --> W["Proposal card in active thread"]

  W --> X["Enter Experience"]
  X --> Y["Learning room"]
  Y --> Z["Sandboxed Three.js iframe"]
  Y --> AA["Room chat"]
  Z --> AB["component_selected / walkthrough_step_changed events"]
  AB --> AA
  AA --> AC["POST /api/agent mode: learning_room with artifact context"]
  AC --> O
  O -- command useful --> AD["send_artifact_command tool"]
  AD --> Z
  AC --> AE["Persist room user + assistant messages in DynamoDB"]
  AE --> AA
  Y --> AF["Exit to thread"]
  AF --> I
```

## Runtime Boundaries

```mermaid
flowchart LR
  subgraph Browser
    Chat[Centered Chat UI]
    Room[Learning Room]
    Frame[Sandboxed Artifact Iframe]
    Store[Demo User ID]
  end

  subgraph NextRoutes[Next.js API Routes]
    AgentAPI["/api/agent"]
  end

  subgraph Agents[OpenAI Agents SDK]
    Agent[Parallax Agent]
    CreateTool[create_experience]
    ResearchTool[research_stem_topic]
    CommandTool[send_artifact_command]
  end

  subgraph ArtifactRuntime[Fixed Artifact Runtime]
    Template[HTML Shell]
    Validator[Static Validator]
    Three[Local Three Module with CDN fallback]
    Bridge[postMessage Contract]
  end

  Chat --> AgentAPI
  Chat --> Store
  AgentAPI --> Agent
  Agent --> ResearchTool
  Agent --> CreateTool
  CreateTool --> Validator
  Validator --> Template
  Template --> Chat
  Chat --> Room
  Room --> Frame
  Frame --> Three
  Frame --> Bridge
  Bridge --> Room
  Room --> AgentAPI
  Agent --> CommandTool
  CommandTool --> Bridge
```

## Deployed Infrastructure

| Service | Responsibility | Runtime Access |
| --- | --- | --- |
| Vercel | Hosts the Next.js app, React client bundle, and API routes. | Browser and serverless functions |
| Vercel Functions | Runs `/api/agent`, `/api/threads`, and `/api/threads/[threadId]`. | Server-side only |
| Amazon DynamoDB | Stores thread summaries, messages, and artifact metadata. | Vercel API routes |
| Amazon S3 | Stores generated artifact `html` and `sceneSource` payloads. | Vercel API routes |
| AWS IAM | Provides scoped access keys for Vercel functions. | Vercel environment variables |
| OpenAI Agents SDK | Runs the Parallax Agent for chat, artifact generation, and room control. | Vercel API routes |


## Persistence Flow

### First Page Load

1. Browser creates or reads `parallax.demoUserId` from localStorage.
2. Browser calls `GET /api/threads?userId=<demo-user-id>`.
3. Vercel function reads DynamoDB thread summaries for `USER#<demo-user-id>`.
4. If no thread exists, the browser calls `POST /api/threads` to create one.
5. Browser loads the newest thread with `GET /api/threads/<threadId>?userId=<demo-user-id>`.

### Main Chat Message

1. Browser posts to `POST /api/agent` with `mode: "chat"`, `userId`, `threadId`, and message history.
2. Vercel function runs the Parallax Agent.
3. If the response is normal chat, the route writes user and assistant messages to DynamoDB.
4. If the agent creates an artifact, the route writes the user message to DynamoDB, uploads artifact `html` and `sceneSource` to S3, writes artifact metadata to DynamoDB, and writes the assistant message with `artifactId` to DynamoDB.

### Learning Room Message

1. Browser posts to `POST /api/agent` with `mode: "learning_room"`, active artifact context, `userId`, and `threadId`.
2. Vercel function runs the Parallax Agent with room-control tools.
3. Assistant text and any artifact commands return to the browser.
4. User and assistant learning-room messages are persisted to DynamoDB with the active `artifactId`.

### Thread Switching

1. Browser calls `GET /api/threads/<threadId>?userId=<demo-user-id>`.
2. Vercel function validates the user owns the thread summary.
3. Messages load from DynamoDB.
4. Artifact metadata loads from DynamoDB.
5. Artifact payloads load from S3.
6. The API converts persisted data back into the active `LearningSession` shape.

## Agent API Contract

The app has one agent endpoint: `POST /api/agent`.

Main chat sends:

```json
{
  "mode": "chat",
  "message": "Teach me jet engines",
  "messages": []
}
```

Learning room chat sends:

```json
{
  "mode": "learning_room",
  "message": "Focus the combustor",
  "artifact": {},
  "messages": [],
  "selectedComponent": null,
  "activeStepId": "intro"
}
```

The route gives the same Parallax Agent different tools based on mode. Main chat gets `research_stem_topic` and `create_experience`. Learning room chat gets `send_artifact_command` plus active artifact context.

## Artifact Contract

The model does not generate the whole page. It generates `sceneSource` JavaScript plus metadata. The fixed runtime provides:

- `THREE`, `scene`, `camera`, `renderer`, `root`, and `controls`
- `registerComponent(id, label, object3D, metadata)`
- `setWalkthroughSteps(steps)`
- `setStatus(message)`
- `fitCameraTo(object3D, position?)`

The validator rejects network calls, dynamic imports, markup injection, oversized code, scenes without at least three registered components, and scenes without walkthrough steps.

## Message Contract

Artifacts post events to the parent:

- `artifact_ready`
- `component_selected`
- `walkthrough_step_changed`
- `artifact_error`

The parent sends commands back:

- `focus_component`
- `go_to_step`
- `start_walkthrough`
- `pause_walkthrough`
- `reset_camera`
- `explode`
- `collapse`
- `toggle_labels`

## DynamoDB Table

Use one table:

```txt
Table name: parallax-hackathon-threads
Partition key: PK
Partition key type: String
Sort key: SK
Sort key type: String
Billing mode: On-demand
```

Thread summary:

```txt
PK = USER#<userId>
SK = THREAD#<threadId>
entityType = thread
```

Message:

```txt
PK = THREAD#<threadId>
SK = MESSAGE#<createdAt>#<messageId>
entityType = message
```

Artifact metadata:

```txt
PK = THREAD#<threadId>
SK = ARTIFACT#<artifactId>
entityType = artifact
htmlS3Key = artifacts/<threadId>/<artifactId>/index.html
sceneSourceS3Key = artifacts/<threadId>/<artifactId>/scene.js
```

## S3 Bucket

Use one private bucket:

```txt
Bucket name: parallax-hackathon-artifacts-<account-id>
Public access: blocked
Object prefix: artifacts/
```

Stored objects:

```txt
artifacts/<threadId>/<artifactId>/index.html
artifacts/<threadId>/<artifactId>/scene.js
```

The bucket does not need public read access. The app reads artifacts through the server-side AWS SDK and returns hydrated thread data through the Vercel API.

## Environment Variables

Set these in Vercel Project Settings and locally in `.env.local`:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4
EXA_API_KEY=

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-west-2

PARALLAX_THREADS_TABLE=parallax-hackathon-threads
PARALLAX_ARTIFACT_BUCKET=parallax-hackathon-artifacts-<account-id>
```

Use the AWS region where the table and bucket were created. For the event workshop account shown in the AWS console, Oregon means:

```bash
AWS_REGION=us-west-2
```

Do not prefix AWS variables with `NEXT_PUBLIC_`; the browser must never receive AWS credentials.

## IAM Policy

The scoped IAM user for Vercel only needs DynamoDB access to the one table and S3 access to the artifact prefix.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:us-west-2:<account-id>:table/parallax-hackathon-threads"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::parallax-hackathon-artifacts-<account-id>/artifacts/*"
    }
  ]
}
```

If the AWS resources are in a different region, update the DynamoDB ARN region and `AWS_REGION`.

## Manual AWS Setup

Create the DynamoDB table:

```bash
aws dynamodb create-table \
  --table-name parallax-hackathon-threads \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region us-west-2
```

Create the S3 bucket:

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ARTIFACT_BUCKET="parallax-hackathon-artifacts-${AWS_ACCOUNT_ID}"

aws s3 mb "s3://${ARTIFACT_BUCKET}" --region us-west-2

aws s3api put-public-access-block \
  --bucket "${ARTIFACT_BUCKET}" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## Deployment Checklist

- DynamoDB table exists with `PK` and `SK` string keys.
- S3 bucket exists in the same region as `AWS_REGION`.
- S3 public access block is enabled.
- IAM access key belongs to the scoped IAM user.
- Vercel env vars are set for Production, Preview, and Development as needed.
- Vercel deployment has been redeployed after env vars changed.
- Local `.env.local` has the same non-public env vars for local testing.

## Operational Notes

- The demo identity is localStorage-based, not real auth.
- The workshop AWS account and IAM keys may expire after the event.
- There is no CloudFront layer because artifacts are loaded through server-side S3 reads, not public URLs.
- There is no queue or async worker; artifact persistence happens inline during the `/api/agent` request.
- There is no global secondary index yet; the current single-table access pattern supports the hackathon thread list and thread load flows.

## Key Decisions

- **Canvas-left learning room**: the artifact is the main stage; chat is contextual support.
- **Proposal first**: the user sees the generated plan before entering.
- **One-shot artifacts**: v1 creates the best complete experience in one pass instead of editing artifacts in place.
- **Sandboxed iframe**: generated code runs in an iframe with a strict `postMessage` bridge.
- **Fixed runtime, generated scene**: the app owns controls, labels, walkthrough UI, and validation.
- **Single Parallax Agent**: one Agents SDK agent handles chat, artifact creation, and room control with mode-specific tools.
- **Single agent endpoint**: `/api/agent` accepts a mode-discriminated payload instead of separate mode-specific routes.
- **AWS-backed thread persistence**: DynamoDB stores thread summaries, messages, and artifact metadata; S3 stores generated artifact payloads.

## References

- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Iconify](https://iconify.design/)
- [Shields.io badges](https://shields.io/)
- [Simple Icons](https://simpleicons.org/)
