// Graph governance indexes for merged entities and manually edited relations.

CREATE INDEX entity_merge_status IF NOT EXISTS
FOR (e:Entity) ON (e.mergeStatus);

CREATE INDEX entity_merged_into IF NOT EXISTS
FOR (e:Entity) ON (e.mergedIntoId);

CREATE INDEX relation_status IF NOT EXISTS
FOR ()-[r:RELATES_TO]-() ON (r.status);

CREATE INDEX relation_review_status IF NOT EXISTS
FOR ()-[r:RELATES_TO]-() ON (r.reviewStatus);

CREATE INDEX relation_source_type IF NOT EXISTS
FOR ()-[r:RELATES_TO]-() ON (r.sourceType);
