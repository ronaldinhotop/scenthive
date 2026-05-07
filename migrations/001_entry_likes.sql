create table if not exists entry_likes (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz default now(),
  unique(entry_id, user_id)
);

alter table entry_likes enable row level security;

create policy "Public read" on entry_likes for select using (true);
create policy "Authenticated insert" on entry_likes for insert with check (auth.uid() = user_id);
create policy "Own delete" on entry_likes for delete using (auth.uid() = user_id);
