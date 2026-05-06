-- Optional hard guard for ScentHive's shared fragrance cache.
-- Run in Supabase SQL Editor after cache cleanup is clean.
-- This prevents exact duplicate name+house rows even if a future code path regresses.

create unique index if not exists fragrances_cache_name_house_unique
on public.fragrances_cache (
  lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]+', ' ', 'g')),
  lower(regexp_replace(coalesce(house, ''), '[^a-zA-Z0-9]+', ' ', 'g'))
)
where name is not null and trim(name) <> '';
