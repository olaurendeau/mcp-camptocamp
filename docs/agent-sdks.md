# Agent SDKs

Start the server from your own agent code. Each SDK below can launch a local MCP server as a subprocess and talk to it over stdio, which is the only transport this server has.

Each example is the vendor's own minimal stdio example, with its source linked. Under each one, **Changes from the source** lists every line we changed, apart from quotes, commas and line breaks in the JavaScript examples, which this repository's formatter (Prettier) normalises. Where the vendor calls MCP support experimental, so does this page.

## Before you start

- **Runtime**: for the npx command, [Node.js](https://nodejs.org/en/download) 22 or later. For the Docker command, Docker. See [Getting started](getting-started.md#prerequisites).
- **Pre-warm**: the first start downloads the npm package or the Docker image. Do it once beforehand, so the first agent run doesn't wait for it: see [Pre-warm the first start](getting-started.md#pre-warm-the-first-start).
- **Docker instead of npx**: in every example, replace the command `npx` with `docker` and the arguments `-y @olaurendeau/mcp-camptocamp` with `run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest`. Keep `-i`: without it the server exits at once.
- **System prompt**: the server sends usage instructions when a client connects, but none of the SDK sources below says that they reach the model. Paste the [system prompt](system-prompt.md) where each example has `<paste the system prompt here>`.

## OpenAI Agents SDK (Python)

Source: [OpenAI Agents SDK docs, Model Context Protocol, section "4. stdio MCP servers"](https://openai.github.io/openai-agents-python/mcp/).

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

async with MCPServerStdio(
    name="camptocamp",
    params={
        "command": "npx",
        "args": ["-y", "@olaurendeau/mcp-camptocamp"],
    },
    require_approval="never",
) as server:
    agent = Agent(
        name="Assistant",
        instructions="<paste the system prompt here>",
        mcp_servers=[server],
    )
    result = await Runner.run(agent, "What is the altitude of the Grande Casse?")
    print(result.final_output)
```

Changes from the source:

- `name`, `command` and `args` start this server instead of the filesystem server; the `pathlib` import and `samples_dir` it needed are gone.
- `require_approval="never"` is added (see below).
- `instructions` and the question passed to `Runner.run` are ours.

Like the source, the example uses `async with` and `await`, so run it inside an `async` function, for example with `asyncio.run(...)`.

**Tool approval.** `MCPServerStdio` accepts `require_approval`, which turns on approval policies for the server's tools: `"always"`, `"never"`, a map from tool name to policy, or a grouped object. With `require_approval="never"`, no call to the 13 tools waits for approval. They only read Camptocamp.

## OpenAI Agents SDK (JavaScript)

Source: [openai-agents-js, `examples/docs/mcp/stdio.ts`](https://github.com/openai/openai-agents-js/blob/main/examples/docs/mcp/stdio.ts), the example shown in the [MCP guide of the JS docs, section "3. Stdio MCP servers"](https://openai.github.io/openai-agents-js/guides/mcp/).

```ts
import { Agent, run, MCPServerStdio } from "@openai/agents";

async function main() {
  const mcpServer = new MCPServerStdio({
    name: "camptocamp",
    fullCommand: "npx -y @olaurendeau/mcp-camptocamp",
  });
  await mcpServer.connect();
  try {
    const agent = new Agent({
      name: "Camptocamp Assistant",
      instructions: "<paste the system prompt here>",
      mcpServers: [mcpServer],
    });
    const result = await run(agent, "What is the altitude of the Grande Casse?");
    console.log(result.finalOutput);
  } finally {
    await mcpServer.close();
  }
}

main().catch(console.error);
```

Changes from the source:

- `name` and `fullCommand` start this server instead of the filesystem server; the `node:path` import and `samplesDir` it needed are gone.
- The agent's `name`, `instructions` and the question passed to `run` are ours.

**Tool approval.** The JS guide documents `requireApproval` for hosted MCP tools only, and a hosted MCP tool needs a public server URL, which this local server doesn't have. The guide's option list for `MCPServerStdio` has no approval setting.

## Mistral Python SDK

Source: the **SDK repository example** [`examples/mistral/agents/async_conversation_run_mcp.py`](https://github.com/mistralai/client-python/blob/main/examples/mistral/agents/async_conversation_run_mcp.py) in `mistralai/client-python`. It is an example from the SDK repository, not a page of the Mistral docs. The SDK exposes agents and conversations under `client.beta`.

The agents features need the `agents` extra: `pip install "mistralai[agents]"` ([SDK README](https://github.com/mistralai/client-python#agents-extra-dependencies)).

```python
#!/usr/bin/env python
import asyncio
import os

from mistralai.client import Mistral
from mistralai.extra.run.context import RunContext
from mcp import StdioServerParameters
from mistralai.extra.mcp.stdio import (
    MCPClientSTDIO,
)

MODEL = "mistral-medium-latest"


async def main() -> None:
    api_key = os.environ["MISTRAL_API_KEY"]
    client = Mistral(api_key=api_key)

    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "@olaurendeau/mcp-camptocamp"],
        env=None,
    )

    camptocamp_agent = client.beta.agents.create(
        model=MODEL,
        name="camptocamp assistant",
        instructions="<paste the system prompt here>",
        description="",
    )

    async with RunContext(
        agent_id=camptocamp_agent.id,
        continue_on_fn_error=True,
    ) as run_ctx:
        # Add mcp client to the run context
        mcp_client = MCPClientSTDIO(stdio_params=server_params)
        await run_ctx.register_mcp_client(mcp_client=mcp_client)

        run_result = await client.beta.conversations.run_async(
            run_ctx=run_ctx,
            inputs="What is the altitude of the Grande Casse?",
        )

        print("All run entries:")
        for entry in run_result.output_entries:
            print(f"{entry}")
            print()


if __name__ == "__main__":
    asyncio.run(main())
```

Changes from the source:

- `command` and `args` start this server instead of the example's Python weather server; the `pathlib` import and `cwd` it needed are gone.
- The agent's variable name, `name`, `instructions` and the `inputs` question are ours.
- The source also registers a local `get_location` function and asks for a `WeatherResult` output format (and prints it as `output_as_model`). Both belong to its weather demo, not to MCP, so they are gone, with the `random` and `BaseModel` imports they used. `output_format` is optional in `RunContext`.

The `instructions` given to `client.beta.agents.create` are the agent's system prompt ([Mistral docs, Agents API](https://docs.mistral.ai/studio/agents/agents-api)).

## google-genai (Python), experimental

Source: the **SDK repository README** of [googleapis/python-genai](https://github.com/googleapis/python-genai), section "Model Context Protocol (MCP) support (experimental)", subsection "MCP for Gemini Developer API". Google says: "Built-in MCP support is an experimental feature. You can pass a local MCP server as a tool directly."

```python
import os
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from google import genai

client = genai.Client()

# Create server parameters for stdio connection
server_params = StdioServerParameters(
    command="npx",  # Executable
    args=["-y", "@olaurendeau/mcp-camptocamp"],  # MCP Server
    env=None,  # Optional environment variables
)

async def run():
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            prompt = "What is the altitude of the Grande Casse?"

            # Initialize the connection between client and server
            await session.initialize()

            # Send request to the model with MCP function declarations
            response = await client.aio.models.generate_content(
                model="gemini-flash-latest",
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    system_instruction="<paste the system prompt here>",
                    tools=[session],  # uses the session, will automatically call the tool using automatic function calling
                ),
            )
            print(response.text)

# Start the asyncio event loop and run the main function
asyncio.run(run())
```

Changes from the source:

- `args` starts this server instead of the weather server.
- The prompt is ours; the `datetime` import it used is gone.
- `system_instruction` is added to `GenerateContentConfig`, the field the same README uses for system instructions.

The example also needs the `mcp` package.

## google-genai (JavaScript), experimental

Source: the **SDK repository README** of [googleapis/js-genai](https://github.com/googleapis/js-genai), section "Model Context Protocol (MCP) support (experimental)". Google says: "Built-in MCP support is an experimental feature. You can pass a local MCP server as a tool directly."

```js
import { GoogleGenAI, mcpToTool } from "@google/genai";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Create server parameters for stdio connection
const serverParams = new StdioClientTransport({
  command: "npx", // Executable
  args: ["-y", "@olaurendeau/mcp-camptocamp"], // MCP Server
});

// Configure the MCP client
const mcpClient = new McpClient({
  name: "example-client",
  version: "1.0.0",
});

// Initialize the connection between client and server
await mcpClient.connect(serverParams);

// Instantiate the GoogleGenAI SDK
const ai = new GoogleGenAI({});

// Send request to the model with MCP tools
const response = await ai.models.generateContent({
  model: "gemini-flash-latest",
  contents: "What is the altitude of the Grande Casse?",
  config: {
    systemInstruction: "<paste the system prompt here>",
    tools: [mcpToTool(mcpClient)], // uses the session, will automatically call the tool using automatic function calling
  },
});
console.log(response.text);

// Close the connection
await mcpClient.close();
```

Changes from the source:

- `args` starts this server instead of the weather server.
- `contents` is our question.
- `systemInstruction` is added to `config`: it is the JS name of `system_instruction` in the SDK's [`GenerateContentConfig` reference](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html).

The example also needs the `@modelcontextprotocol/sdk` package.

## Next steps

- [System prompt](system-prompt.md): the prompt to paste, and why each rule is there.
- [Troubleshooting](troubleshooting.md) if the server does not start.

## Sources

- OpenAI Agents SDK (Python), MCP: https://openai.github.io/openai-agents-python/mcp/
- OpenAI Agents SDK (JS), MCP guide: https://openai.github.io/openai-agents-js/guides/mcp/
- OpenAI Agents SDK (JS), stdio example: https://github.com/openai/openai-agents-js/blob/main/examples/docs/mcp/stdio.ts
- Mistral Python SDK, SDK repository example: https://github.com/mistralai/client-python/blob/main/examples/mistral/agents/async_conversation_run_mcp.py
- Mistral Python SDK, README (agents extra): https://github.com/mistralai/client-python
- Mistral docs, Agents API: https://docs.mistral.ai/studio/agents/agents-api
- google-genai (Python), SDK repository README: https://github.com/googleapis/python-genai
- google-genai (JS), SDK repository README: https://github.com/googleapis/js-genai
- google-genai (JS), `GenerateContentConfig` reference: https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html

Last verified: 2026-10-05 against official docs
