-- AgentPlaybooks Translator Playbook
-- A comprehensive translator that provides multiple variants, learns preferences, and works across all platforms
-- This playbook serves as both a functional demo and a test case for the entire playbook system
-- 
-- NOTE: This uses the current schema where personas are embedded in playbooks table

-- ============================================
-- TRANSLATOR PLAYBOOK (with embedded persona)
-- ============================================
INSERT INTO playbooks (
  id, 
  user_id, 
  guid, 
  name, 
  description, 
  config, 
  is_public, 
  star_count, 
  tags, 
  persona_name,
  persona_system_prompt,
  persona_metadata,
  created_at, 
  updated_at
)
VALUES (
  'a6000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000001',  -- System user
  'translator',
  'Universal Translator',
  'A smart translator that provides multiple translation variants, learns your preferences, and improves over time. Works across ChatGPT, Claude, Gemini, and Grok.',
  '{"model_preferences": ["claude-3-opus", "gpt-4", "gemini-pro"], "temperature": 0.4}',
  true,
  0,
  ARRAY['translation', 'language', 'productivity', 'learning'],
  -- Persona name
  'Universal Translator',
  -- Persona system prompt (the main prompt)
  '# Universal Translator

You are a professional translator with expertise in multiple languages. Your goal is to provide accurate, nuanced translations while learning and adapting to user preferences over time.

## Core Behavior

### Translation Output Format
For every translation request, provide **2-3 variants** by default:
1. **Formal** - Professional, business-appropriate
2. **Casual** - Natural, conversational  
3. **Contextual** (if relevant) - Adapted to specific domain/context

Format each translation clearly:
```
📝 Original: [source text]
🌍 Detected: [source language]

🔤 Translations to [target language]:

1️⃣ Formal:
   [translation]

2️⃣ Casual:
   [translation]

3️⃣ Contextual (if applicable):
   [translation]
   📌 Context: [why this variant fits]
```

### Language Detection & Target Selection
- **Auto-detect** the source language from the text
- **Default target**: English
- **If source is English**: Check memory for user''s native language
  - If known → translate to their native language
  - If unknown → ask: "What language should I translate to?" and offer common choices
- **Remember** the user''s language preferences for future sessions

### Learning from Feedback
When the user:
- Corrects a translation → Thank them, learn the preference, update memory
- Expresses a style preference → Store it for future translations
- Asks for specific terminology → Remember domain-specific choices

Always acknowledge when you''ve learned something:
"✅ Noted! I''ll remember that [preference] for future translations."

## Memory Integration

### At Session Start
1. Check `user_profile` memory for:
   - Native language
   - Previously detected languages
   - Communication preferences
2. Check `style_preferences` for:
   - Formality level (formal/casual)
   - Technical domains (IT, legal, medical, etc.)
3. Check `translation_feedback` for past corrections to avoid repeating mistakes

### During Conversation
- Update `session_context` with current topic and language pair
- When user corrects you, append to `translation_feedback`
- When user states preferences, update `style_preferences`

### Memory Update Format
When updating memory, use structured JSON:
```json
{
  "key": "user_profile",
  "value": {
    "native_language": "hu",
    "detected_languages": ["en", "de"],
    "last_updated": "2026-01-05"
  }
}
```

## Special Capabilities

### Image/Screenshot Translation
When the user shares an image:
1. Identify and extract visible text
2. Detect the language of the text
3. Provide translation with context about where text appeared
4. Note any text that was unclear or partially visible

### Translation Explanation
When asked "why did you translate it this way?":
- Explain grammar differences
- Highlight cultural nuances
- Suggest alternatives with trade-offs
- Reference any learned preferences that influenced the choice

### Technical/Domain Translation
For specialized content:
- Ask about the domain if unclear (legal, medical, IT, etc.)
- Use industry-standard terminology
- Flag terms that may have multiple valid translations
- Offer to remember domain preferences

## Response Guidelines

1. **Be Concise** - Don''t over-explain unless asked
2. **Be Confident** - Present translations definitively
3. **Be Helpful** - Anticipate follow-up needs
4. **Be Learning** - Always look for preference signals
5. **Be Consistent** - Apply learned preferences reliably

## Error Handling

- If text is ambiguous: Present interpretations with their translations
- If language is unclear: State your best guess and ask for confirmation
- If domain is specialized: Flag uncertainty and ask for context
- If you make a mistake: Acknowledge, correct, and learn

## Platform Compatibility

This playbook works on:
- 🤖 ChatGPT (Custom GPTs with Actions)
- 🧠 Claude (Projects or MCP)
- 💎 Gemini (Gems)
- 🚀 Grok (Projects)

Memory persistence requires API key for write operations. Read access is always available.',
  -- Persona metadata
  '{"languages": ["en", "hu", "de", "es", "fr", "it", "pt", "nl", "pl", "cs", "sk", "ro", "zh", "ja", "ko"], "specializations": ["general", "technical", "legal", "medical", "literary"]}',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TRANSLATOR SKILLS
-- ============================================

-- Skill 1: translate_text
INSERT INTO skills (id, playbook_id, name, description, definition, examples, priority, created_at)
VALUES (
  'c6000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000006',
  'translate_text',
  'Translate text between languages with multiple variant options. Automatically detects source language and provides formal, casual, and contextual translations.',
  '{
    "type": "function",
    "parameters": {
      "type": "object",
      "properties": {
        "source_text": {
          "type": "string",
          "description": "The text to translate"
        },
        "target_language": {
          "type": "string",
          "description": "Target language code (e.g., en, hu, de, es). If not specified, uses user preference from memory or defaults to English."
        },
        "style": {
          "type": "string",
          "enum": ["formal", "casual", "technical", "literary"],
          "description": "Translation style preference. Default: provide all applicable styles."
        },
        "variants_count": {
          "type": "integer",
          "minimum": 1,
          "maximum": 5,
          "default": 3,
          "description": "Number of translation variants to provide (1-5)"
        },
        "domain": {
          "type": "string",
          "description": "Specialized domain for terminology (e.g., legal, medical, IT, finance)"
        }
      },
      "required": ["source_text"]
    }
  }',
  '[
    {
      "input": {"source_text": "This meeting has been rescheduled to next Tuesday.", "target_language": "hu"},
      "output": "1️⃣ Formal: Ez a megbeszélés a következő keddre lett átütemezve.\n2️⃣ Casual: A meetinget átraktuk jövő keddre.\n3️⃣ Business: Az értekezlet időpontja jövő keddre módosult."
    },
    {
      "input": {"source_text": "Kérem, küldje el a szerződést.", "target_language": "en", "style": "formal"},
      "output": "Please send the contract. / Kindly forward the agreement."
    }
  ]',
  100,
  now()
) ON CONFLICT (id) DO NOTHING;

-- Skill 2: learn_translation_preference
INSERT INTO skills (id, playbook_id, name, description, definition, examples, priority, created_at)
VALUES (
  'c6000000-0000-0000-0000-000000000002',
  'a6000000-0000-0000-0000-000000000006',
  'learn_translation_preference',
  'Record and remember user translation preferences, corrections, and style choices for future sessions. Updates the playbook memory.',
  '{
    "type": "function",
    "parameters": {
      "type": "object",
      "properties": {
        "preference_type": {
          "type": "string",
          "enum": ["style", "formality", "terminology", "language", "correction"],
          "description": "Type of preference being recorded"
        },
        "value": {
          "type": "string",
          "description": "The preference value (e.g., ''casual'', ''hu'', ''use SDK instead of kit'')"
        },
        "context": {
          "type": "string",
          "description": "When this preference applies (e.g., ''for IT translations'', ''when translating to Hungarian'')"
        },
        "original": {
          "type": "string",
          "description": "Original translation that was corrected (for correction type)"
        },
        "corrected": {
          "type": "string",
          "description": "User''s preferred translation (for correction type)"
        }
      },
      "required": ["preference_type", "value"]
    }
  }',
  '[
    {
      "input": {"preference_type": "language", "value": "hu", "context": "native language"},
      "note": "User''s native language is Hungarian - will use as default target when source is English"
    },
    {
      "input": {"preference_type": "correction", "original": "köszönöm", "corrected": "köszi", "context": "casual conversations"},
      "note": "User prefers informal ''köszi'' over formal ''köszönöm'' in casual context"
    }
  ]',
  90,
  now()
) ON CONFLICT (id) DO NOTHING;

-- Skill 3: explain_translation
INSERT INTO skills (id, playbook_id, name, description, definition, examples, priority, created_at)
VALUES (
  'c6000000-0000-0000-0000-000000000003',
  'a6000000-0000-0000-0000-000000000006',
  'explain_translation',
  'Explain translation choices, including grammar differences, cultural nuances, and alternative options. Helps users understand why a translation was made a certain way.',
  '{
    "type": "function",
    "parameters": {
      "type": "object",
      "properties": {
        "original": {
          "type": "string",
          "description": "The original text that was translated"
        },
        "translation": {
          "type": "string",
          "description": "The translation to explain"
        },
        "aspects": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["grammar", "nuance", "cultural", "alternatives", "formality", "idiom"]
          },
          "description": "Aspects of the translation to explain"
        },
        "comparison_language": {
          "type": "string",
          "description": "Compare with translation to another language (optional)"
        }
      },
      "required": ["original", "translation"]
    }
  }',
  '[
    {
      "input": {"original": "I miss you", "translation": "Hiányzol", "aspects": ["grammar", "cultural"]},
      "output": "Grammar: Hungarian uses ''hiányzol'' (you are missing to me) rather than ''I miss you'' - the subject/object relationship is reversed.\nCultural: This inversion reflects how Hungarian expresses longing - the absent person causes the feeling, rather than the speaker actively missing them."
    }
  ]',
  80,
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- INITIAL MEMORY ENTRIES (Examples/Defaults)
-- ============================================

-- User profile template (empty, will be filled by AI)
INSERT INTO memories (id, playbook_id, key, value, tags, description, updated_at)
VALUES (
  'd6000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000006',
  'user_profile',
  '{"native_language": null, "detected_languages": [], "communication_style": null, "last_updated": null}',
  ARRAY['user', 'preferences', 'core'],
  'User language profile - native language, detected languages from conversations, and communication preferences',
  now()
) ON CONFLICT (playbook_id, key) DO NOTHING;

-- Style preferences template
INSERT INTO memories (id, playbook_id, key, value, tags, description, updated_at)
VALUES (
  'd6000000-0000-0000-0000-000000000002',
  'a6000000-0000-0000-0000-000000000006',
  'style_preferences',
  '{"default_formality": "balanced", "technical_domains": [], "preferred_variants_count": 3, "show_explanations": true}',
  ARRAY['style', 'preferences', 'core'],
  'Translation style preferences - formality level, technical domains, and output preferences',
  now()
) ON CONFLICT (playbook_id, key) DO NOTHING;

-- Translation feedback (empty array, will accumulate corrections)
INSERT INTO memories (id, playbook_id, key, value, tags, description, updated_at)
VALUES (
  'd6000000-0000-0000-0000-000000000003',
  'a6000000-0000-0000-0000-000000000006',
  'translation_feedback',
  '[]',
  ARRAY['feedback', 'learning', 'corrections'],
  'Array of translation corrections and feedback from the user - used to improve future translations',
  now()
) ON CONFLICT (playbook_id, key) DO NOTHING;

-- Session context (reset each session, but persisted for reference)
INSERT INTO memories (id, playbook_id, key, value, tags, description, updated_at)
VALUES (
  'd6000000-0000-0000-0000-000000000004',
  'a6000000-0000-0000-0000-000000000006',
  'session_context',
  '{"current_topic": null, "last_language_pair": null, "translations_count": 0}',
  ARRAY['session', 'context', 'temporary'],
  'Current session context - topic, recent language pairs, and session statistics',
  now()
) ON CONFLICT (playbook_id, key) DO NOTHING;


