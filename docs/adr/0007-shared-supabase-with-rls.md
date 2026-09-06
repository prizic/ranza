# Use shared Supabase environments with database-enforced tenancy

Development, staging, and production will each use a shared Supabase backend rather than infrastructure per Dormitory Operator. Every customer-owned row carries its Operator boundary, while Branch assignments and roles are enforced by PostgreSQL row-level security in addition to application authorization. This keeps operations viable for a small SaaS while making cross-Operator access a database-level denial rather than only a user-interface convention.
