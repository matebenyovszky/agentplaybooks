BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.seed_skill_content(skill_name text, description text, definition jsonb, examples jsonb)
RETURNS text LANGUAGE sql AS $$
  SELECT E'---\nname: ' || replace(skill_name, '_', '-') || E'\ndescription: '
    || to_json(COALESCE(description, 'Seed skill'))::text || E'\n---\n\n'
    || COALESCE(definition->>'system_prompt', description, '')
    || E'\n\n## Original definition\n```json\n' || COALESCE(definition, '{}'::jsonb)::text
    || E'\n```\n\n## Examples\n```json\n' || COALESCE(examples, '[]'::jsonb)::text || E'\n```\n';
$$;
-- Meta Playbook: AgentPlaybooks Assistant
-- This playbook teaches AI how to use the AgentPlaybooks Management API
-- It should be inserted as a public playbook accessible to all users

-- First, we need to create this as a system playbook
-- In production, replace 'SYSTEM_USER_ID' with an actual admin user ID

DO $$
DECLARE
    v_playbook_id UUID;
    v_user_id UUID;
    v_publisher_id UUID;
    v_skill_id UUID;
BEGIN
    -- Check if meta playbook already exists
    SELECT id INTO v_playbook_id 
    FROM playbooks 
    WHERE guid = 'agentplaybooks-assistant';
    
    IF v_playbook_id IS NULL THEN
        SELECT id INTO v_user_id FROM auth.users ORDER BY created_at LIMIT 1;
        SELECT id INTO v_publisher_id FROM profiles WHERE auth_user_id = v_user_id LIMIT 1;
        IF v_user_id IS NULL OR v_publisher_id IS NULL THEN
            RAISE EXCEPTION 'A user and matching publisher profile are required to seed a playbook';
        END IF;

        -- Create the playbook
        INSERT INTO playbooks (
            user_id,
            publisher_id,
            guid, 
            name, 
            description, 
            visibility,
            config,
            tags
        ) VALUES (
            v_user_id,
            v_publisher_id,
            'agentplaybooks-assistant',
            'AgentPlaybooks Assistant',
            'This playbook teaches AI agents how to use the AgentPlaybooks platform. It provides skills and guidance for creating, managing, and using playbooks programmatically via the Management API and MCP Server.',
            'public',
            '{"category": "meta", "featured": true}'::jsonb,
            ARRAY['meta', 'management', 'api', 'mcp', 'assistant']
        )
        RETURNING id INTO v_playbook_id;
        
        -- Create the main persona
        UPDATE playbooks SET (persona_name, persona_system_prompt, persona_metadata) = (

            'Playbook Manager',
            E'You are an expert assistant for the AgentPlaybooks platform. You help users create and manage playbooks programmatically using the Management API or MCP Server.

## What is AgentPlaybooks?

AgentPlaybooks is a platform for creating reusable AI agent configurations. A playbook contains:
- **Personas**: System prompts that define AI personalities and behaviors
- **Skills**: Capability definitions with input/output schemas (like tools)
- **Memory**: Persistent key-value storage that AI agents can read and write
- **MCP Servers**: Model Context Protocol configurations

## How to Access the API

### Option 1: REST API with User API Key

Users can generate a User API Key from their dashboard. This key allows full CRUD operations on all their playbooks.

```
Authorization: Bearer apb_live_xxxxxxxxxx
```

API Base: `https://apbks.com/api/manage`

Endpoints:
- GET /manage/playbooks - List playbooks
- POST /manage/playbooks - Create playbook
- GET /manage/playbooks/:id - Get playbook
- PUT /manage/playbooks/:id - Update playbook
- DELETE /manage/playbooks/:id - Delete playbook
- POST /manage/playbooks/:id/personas - Add persona
- PUT /manage/playbooks/:id/personas/:pid - Update persona
- DELETE /manage/playbooks/:id/personas/:pid - Delete persona
- POST /manage/playbooks/:id/skills - Add skill
- PUT /manage/playbooks/:id/skills/:sid - Update skill
- DELETE /manage/playbooks/:id/skills/:sid - Delete skill

OpenAPI spec: GET /api/manage/openapi.json

### Option 2: MCP Server

Connect to the Management MCP Server:

```json
{
  "mcpServers": {
    "agentplaybooks-manage": {
      "url": "https://apbks.com/api/mcp/manage",
      "headers": {
        "Authorization": "Bearer apb_live_xxxxxxxxxx"
      }
    }
  }
}
```

Available tools: list_playbooks, create_playbook, get_playbook, update_playbook, delete_playbook, create_persona, update_persona, delete_persona, create_skill, update_skill, delete_skill, read_memory, write_memory, delete_memory

## Best Practices

1. **Skill Naming**: Use snake_case for skill names (e.g., `code_review`, `summarize_text`)

2. **Skill Definitions**: Always include a clear description and parameter schema:
```json
{
  "name": "code_review",
  "description": "Review code for bugs, style issues, and improvements",
  "definition": {
    "parameters": {
      "type": "object",
      "properties": {
        "code": { "type": "string", "description": "The code to review" },
        "language": { "type": "string", "description": "Programming language" }
      },
      "required": ["code"]
    }
  }
}
```

3. **Personas**: Write clear, focused system prompts. Start with the role, then describe behaviors and constraints.

4. **Memory**: Use memory for persistent context like user preferences, conversation history, or learned information.

5. **Public Playbooks**: Make playbooks public to share them in the marketplace.

## When to Create a New Playbook

Create a new playbook when:
- Starting a new project or domain
- Building a specialized AI assistant
- Creating a reusable template
- Organizing related skills together

## Permissions

User API Keys can have these permissions:
- playbooks:read - List and read playbooks
- playbooks:write - Create, update, delete playbooks  
- personas:write - Manage personas
- skills:write - Manage skills
- memory:read - Read memory
- memory:write - Write/delete memory
- full - All permissions

Ask the user to confirm before creating or deleting playbooks.',
            '{"type": "primary", "icon": "🎭"}'::jsonb) WHERE id = v_playbook_id;

        -- Create skills for the meta playbook
        
        -- Skill: Explain Playbook Concepts
        INSERT INTO skills (playbook_id, publisher_id, name, description, content)
        SELECT v_playbook_id, v_publisher_id, replace(seed.name, '_', '-'), seed.description,
          pg_temp.seed_skill_content(seed.name, seed.description, seed.definition, seed.examples)
        FROM (VALUES (
            'explain_concept',
            'Explain a specific AgentPlaybooks concept to the user',
            '{
                "parameters": {
                    "type": "object",
                    "properties": {
                        "concept": {
                            "type": "string",
                            "enum": ["playbook", "persona", "skill", "memory", "mcp_server", "api_key", "user_api_key", "management_api", "mcp_protocol"],
                            "description": "The concept to explain"
                        },
                        "detail_level": {
                            "type": "string",
                            "enum": ["brief", "detailed", "with_examples"],
                            "default": "detailed"
                        }
                    },
                    "required": ["concept"]
                }
            }'::jsonb,
            '[
                {"input": {"concept": "playbook", "detail_level": "brief"}, "output": "A playbook is a container for AI configurations..."},
                {"input": {"concept": "skill", "detail_level": "with_examples"}, "output": "A skill is a capability definition..."}
            ]'::jsonb)) AS seed(name, description, definition, examples);

        -- Skill: Generate Playbook Template
        INSERT INTO skills (playbook_id, publisher_id, name, description, content)
        SELECT v_playbook_id, v_publisher_id, replace(seed.name, '_', '-'), seed.description,
          pg_temp.seed_skill_content(seed.name, seed.description, seed.definition, seed.examples)
        FROM (VALUES (
            'generate_playbook_template',
            'Generate a playbook template for a specific use case',
            '{
                "parameters": {
                    "type": "object",
                    "properties": {
                        "use_case": {
                            "type": "string",
                            "description": "Description of what the playbook should do"
                        },
                        "include_persona": {
                            "type": "boolean",
                            "default": true
                        },
                        "include_skills": {
                            "type": "boolean",
                            "default": true
                        },
                        "num_skills": {
                            "type": "integer",
                            "default": 3,
                            "minimum": 1,
                            "maximum": 10
                        }
                    },
                    "required": ["use_case"]
                }
            }'::jsonb,
            '[
                {"input": {"use_case": "Code review assistant", "num_skills": 3}, "output": {"name": "Code Review Assistant", "persona": {...}, "skills": [...]}}
            ]'::jsonb)) AS seed(name, description, definition, examples);

        -- Skill: Suggest Skill Definition
        INSERT INTO skills (playbook_id, publisher_id, name, description, content)
        SELECT v_playbook_id, v_publisher_id, replace(seed.name, '_', '-'), seed.description,
          pg_temp.seed_skill_content(seed.name, seed.description, seed.definition, seed.examples)
        FROM (VALUES (
            'suggest_skill_definition',
            'Suggest a skill definition based on a description',
            '{
                "parameters": {
                    "type": "object",
                    "properties": {
                        "skill_description": {
                            "type": "string",
                            "description": "What the skill should do"
                        },
                        "format": {
                            "type": "string",
                            "enum": ["json", "openapi", "anthropic"],
                            "default": "json"
                        }
                    },
                    "required": ["skill_description"]
                }
            }'::jsonb,
            '[
                {"input": {"skill_description": "Summarize a document"}, "output": {"name": "summarize_document", "definition": {...}}}
            ]'::jsonb)) AS seed(name, description, definition, examples);

        -- Skill: Troubleshoot API Issues
        INSERT INTO skills (playbook_id, publisher_id, name, description, content)
        SELECT v_playbook_id, v_publisher_id, replace(seed.name, '_', '-'), seed.description,
          pg_temp.seed_skill_content(seed.name, seed.description, seed.definition, seed.examples)
        FROM (VALUES (
            'troubleshoot_api',
            'Help troubleshoot AgentPlaybooks API issues',
            '{
                "parameters": {
                    "type": "object",
                    "properties": {
                        "error_message": {
                            "type": "string",
                            "description": "The error message received"
                        },
                        "endpoint": {
                            "type": "string",
                            "description": "The API endpoint being called"
                        },
                        "method": {
                            "type": "string",
                            "enum": ["GET", "POST", "PUT", "DELETE"]
                        }
                    },
                    "required": ["error_message"]
                }
            }'::jsonb,
            '[]'::jsonb)) AS seed(name, description, definition, examples);

        -- Skill: Create Playbook via API
        INSERT INTO skills (playbook_id, publisher_id, name, description, content)
        SELECT v_playbook_id, v_publisher_id, replace(seed.name, '_', '-'), seed.description,
          pg_temp.seed_skill_content(seed.name, seed.description, seed.definition, seed.examples)
        FROM (VALUES (
            'create_playbook_api_call',
            'Generate the API call to create a new playbook',
            '{
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Name for the new playbook"
                        },
                        "description": {
                            "type": "string",
                            "description": "Description of the playbook"
                        },
                        "is_public": {
                            "type": "boolean",
                            "default": false
                        },
                        "format": {
                            "type": "string",
                            "enum": ["curl", "javascript", "python"],
                            "default": "curl"
                        }
                    },
                    "required": ["name"]
                }
            }'::jsonb,
            '[
                {"input": {"name": "My Assistant", "format": "curl"}, "output": "curl -X POST https://apbks.com/api/manage/playbooks -H \"Authorization: Bearer $API_KEY\" -H \"Content-Type: application/json\" -d ''{\"name\": \"My Assistant\"}''"}
            ]'::jsonb)) AS seed(name, description, definition, examples);

        RAISE NOTICE 'Meta playbook created with ID: %', v_playbook_id;
    ELSE
        RAISE NOTICE 'Meta playbook already exists with ID: %', v_playbook_id;
    END IF;
END $$;

-- Add some initial memory to the meta playbook
INSERT INTO memories (playbook_id, key, value)
SELECT 
    id,
    'api_versions',
    '{"current": "1.0.0", "supported": ["1.0.0"], "mcp_protocol": "2024-11-05"}'::jsonb
FROM playbooks 
WHERE guid = 'agentplaybooks-assistant'
ON CONFLICT (playbook_id, key) DO NOTHING;

INSERT INTO memories (playbook_id, key, value)
SELECT 
    id,
    'documentation_links',
    '{
        "api_reference": "/docs/api-reference",
        "mcp_integration": "/docs/mcp-integration",
        "getting_started": "/docs/getting-started",
        "openapi_spec": "/api/manage/openapi.json",
        "mcp_server": "/api/mcp/manage"
    }'::jsonb
FROM playbooks 
WHERE guid = 'agentplaybooks-assistant'
ON CONFLICT (playbook_id, key) DO NOTHING;


COMMIT;
