#!/usr/bin/env bun

import { readdir, readFile, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

interface LexiconDef {
  lexicon: number;
  id: string;
  defs: {
    main: {
      type: string;
      record: {
        type: string;
        required: string[];
        properties: Record<string, any>;
      };
    };
  };
}

async function generateTypes() {
  console.log('🔧 Generating TypeScript types from lexicons...');
  
  const lexiconsDir = './lexicons';
  const outputDir = './src/types';
  
  try {
    await mkdir(outputDir, { recursive: true });
    
    const files = await readdir(lexiconsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    for (const file of jsonFiles) {
      const content = await readFile(join(lexiconsDir, file), 'utf-8');
      const lexicon: LexiconDef = JSON.parse(content);
      
      console.log(`📝 Processing ${lexicon.id}...`);
      
      const types = generateTypeDefinitions(lexicon);
      const outputFile = join(outputDir, `${lexicon.id}.ts`);
      
      await writeFile(outputFile, types);
      console.log(`✅ Generated ${outputFile}`);
    }
    
    console.log('🎉 Type generation complete!');
  } catch (error) {
    console.error('❌ Error generating types:', error);
    process.exit(1);
  }
}

function generateTypeDefinitions(lexicon: LexiconDef): string {
  const { id, defs } = lexicon;
  const mainDef = defs.main;
  
  if (mainDef.type !== 'record') {
    throw new Error(`Unsupported lexicon type: ${mainDef.type}`);
  }
  
  const properties = mainDef.record.properties;
  const required = mainDef.record.required;
  
  let typeProps = '';
  for (const [propName, propDef] of Object.entries(properties)) {
    const isRequired = required.includes(propName);
    const optional = isRequired ? '' : '?';
    const tsType = mapJsonSchemaTypeToTS(propDef);
    typeProps += `  ${propName}${optional}: ${tsType};\n`;
  }
  
  return `// Auto-generated from ${id}.json
export interface Record {
  $type?: '${id}';
${typeProps}}

export function isRecord(obj: unknown): obj is Record {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '$type' in obj &&
    (obj as any).$type === '${id}'
  );
}

export function createRecord(data: Omit<Record, '$type'>): Record {
  return {
    ...data,
    $type: '${id}',
  };
}
`;
}

function mapJsonSchemaTypeToTS(propDef: any): string {
  switch (propDef.type) {
    case 'string':
      if (propDef.format === 'datetime') {
        return 'string'; // ISO datetime string
      }
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      const itemType = mapJsonSchemaTypeToTS(propDef.items);
      return `${itemType}[]`;
    case 'object':
      return 'Record<string, any>';
    default:
      return 'any';
  }
}

// Run the generator
generateTypes();