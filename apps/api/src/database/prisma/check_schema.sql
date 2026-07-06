SELECT table_name, column_name FROM information_schema.columns
WHERE table_name IN ('document_contents', 'documents', 'knowledge_nodes')
ORDER BY table_name, ordinal_position;
