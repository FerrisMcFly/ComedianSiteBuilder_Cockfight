-- ComicTable v2: every database change since v1 in one file. Paste it all into Supabase → SQL Editor and click Run.
-- Same as running 07, 08, 09, 10, 11, 12, 13, 14, 99 in order. Safe to run again, and safe if you already ran some of them.

-- ============================== 07_more_sources.sql ==============================
-- Multiple podcasts and YouTube channels per site, and channels that belong to a person.
-- Run once in Supabase → SQL Editor. Safe to run again.

alter table sources add column if not exists host text references hosts(id) on delete set null;   -- whose channel (null = the show's)
alter table videos add column if not exists source_id uuid references sources(id) on delete set null;
alter table videos add column if not exists channel text;                                           -- the channel's name, for labels and filters
alter table videos add column if not exists host text references hosts(id) on delete set null;     -- shows the video on that person's page
alter table episodes add column if not exists source_id uuid references sources(id) on delete set null;
alter table episodes add column if not exists show_name text;                                       -- which podcast, when a site has more than one
create index if not exists videos_host_idx on videos (site_id, host);

-- ============================== 08_create_sites.sql ==============================
-- Lets platform admins (you) create a new comic's site from the admin, in one step, and gives
-- platform admins full access to every site. Run once in Supabase → SQL Editor. Safe to run again.

-- Each site's team can manage only that site. Platform admins (ComicTable's super admins) can manage all of them.
create or replace function public.is_site_admin(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and site_id = sid)
      or exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- Who the super admins are, for the admin's All sites page (only super admins can see this)
drop function if exists public.platform_admin_list();  -- (21_roles.sql adds a role column to it)
create or replace function public.platform_admin_list()
returns table (user_id uuid, email text, you boolean) language sql stable security definer set search_path = public as $$
  select p.user_id, u.email::text, p.user_id = auth.uid()
  from platform_admins p join auth.users u on u.id = p.user_id
  where exists (select 1 from platform_admins where user_id = auth.uid())
  order by u.email;
$$;
revoke all on function public.platform_admin_list() from public;
grant execute on function public.platform_admin_list() to authenticated;

create or replace function public.remove_platform_admin(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from platform_admins where user_id = auth.uid()) then
    raise exception 'Only super admins can do that.' using errcode = 'P0001';
  end if;
  if p_user = auth.uid() then
    raise exception 'You can''t remove yourself.' using errcode = 'P0001';
  end if;
  delete from platform_admins where user_id = p_user;
end $$;
revoke all on function public.remove_platform_admin(uuid) from public;
grant execute on function public.remove_platform_admin(uuid) to authenticated;

create or replace function public.create_site(p_id text, p_name text, p_domain text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only ComicTable platform admins can create sites.' using errcode = 'P0001';
  end if;
  if p_id !~ '^[a-z0-9][a-z0-9-]{1,40}$' then
    raise exception 'A site id uses lowercase letters, numbers and dashes, like "john-smith".' using errcode = 'P0001';
  end if;
  if exists (select 1 from sites where id = p_id) then
    raise exception 'There''s already a site called "%".', p_id using errcode = 'P0001';
  end if;
  insert into sites (id, name, domain, features)
    values (p_id, p_name, nullif(trim(coalesce(p_domain, '')), ''),
            '{"shows": true, "podcast": true, "videos": true, "merch": false, "forum": false, "chat": false}');
  -- No team row for you: platform admins can already manage every site (see is_site_admin below),
  -- and staying off the team keeps you out of the comic's team list.
  insert into boards (site_id, id, name, description, sort) values
    (p_id, 'general', 'General', 'Talk about anything', 0),
    (p_id, 'shows', 'Live Shows', 'Going to a show? Saw one? Post here', 1),
    (p_id, 'episodes', 'Episodes', 'Talk about the latest episodes', 2);
end $$;
revoke all on function public.create_site(text, text, text) from public;
grant execute on function public.create_site(text, text, text) to authenticated;

-- Platform admins can edit any site's settings (name, domain, sections), not just their own
drop policy if exists "platform admins edit sites" on sites;
create policy "platform admins edit sites" on sites for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- "Get your site" requests from the comictable.com front page.
-- Anyone can send one; only platform admins can read them.
create table if not exists site_requests (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  act text check (length(act) <= 200),
  links text check (length(links) <= 1000),
  note text check (length(note) <= 2000),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table site_requests enable row level security;
drop policy if exists "anyone can ask" on site_requests;
create policy "anyone can ask" on site_requests for insert to anon, authenticated with check (handled = false);
drop policy if exists "platform admins read" on site_requests;
create policy "platform admins read" on site_requests for select to authenticated using (public.is_platform_admin());
drop policy if exists "platform admins update" on site_requests;
create policy "platform admins update" on site_requests for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists "platform admins delete" on site_requests;
create policy "platform admins delete" on site_requests for delete to authenticated using (public.is_platform_admin());
grant insert on site_requests to anon, authenticated;
grant select, update, delete on site_requests to authenticated;

-- ============================== 09_places.sql ==============================
-- Towns and cities with their map position, used to find fans near a show.
-- Run once in Supabase → SQL Editor, before 10_fans.sql. Safe to run again. (2901 places)
create table if not exists places (
  id bigint primary key,
  name text not null,
  state text,
  country text not null,
  lat double precision not null,
  lng double precision not null,
  population int not null default 0
);
create index if not exists places_name on places (lower(name));
alter table places enable row level security;
drop policy if exists "public read" on places;
create policy "public read" on places for select using (true);
grant select on places to anon, authenticated;
insert into places (id, name, state, country, lat, lng, population) values
(2062338,'Rockingham',null,'AU',-32.27682,115.72978,108022),
(2063523,'Perth',null,'AU',-31.95224,115.8614,1896548),
(2067119,'Mandurah',null,'AU',-32.5269,115.7217,83294),
(2073124,'Darwin',null,'AU',-12.46113,130.84185,129062),
(2075432,'Bunbury',null,'AU',-33.32711,115.64137,68248),
(2078025,'Adelaide',null,'AU',-34.92866,138.59863,1225235),
(2146142,'Townsville',null,'AU',-19.26639,146.80569,196219),
(2146268,'Toowoomba',null,'AU',-27.56056,151.95386,131258),
(2147714,'Sydney',null,'AU',-33.86785,151.20732,4627345),
(2151437,'Rockhampton',null,'AU',-23.38032,150.50595,61724),
(2151716,'Reservoir',null,'AU',-37.71667,145,50092),
(2155472,'Newcastle',null,'AU',-32.92953,151.7801,308308),
(2158177,'Melbourne',null,'AU',-37.814,144.96332,4246375),
(2159045,'Maitland',null,'AU',-32.73308,151.5574,67132),
(2159220,'Mackay',null,'AU',-21.15345,149.16554,74219),
(2160517,'Launceston',null,'AU',-41.43876,147.13467,106153),
(2163355,'Hobart',null,'AU',-42.87936,147.32941,216656),
(2165087,'Gold Coast',null,'AU',-28.00029,153.43088,591473),
(2165798,'Geelong',null,'AU',-38.14711,144.36069,226034),
(2170089,'Craigieburn',null,'AU',-37.6,144.95,50069),
(2171507,'Wollongong',null,'AU',-34.424,150.89345,292190),
(2172517,'Canberra',null,'AU',-35.28346,149.12807,367752),
(2172797,'Cairns',null,'AU',-16.92366,145.76613,153075),
(2173323,'Bundaberg',null,'AU',-24.86621,152.3479,70826),
(2174003,'Brisbane',null,'AU',-27.46794,153.02809,2189878),
(2176187,'Bendigo',null,'AU',-36.75818,144.28024,100617),
(2177091,'Ballarat',null,'AU',-37.56622,143.84957,97937),
(6354957,'Hervey Bay',null,'AU',-25.28762,152.76936,52230),
(7281838,'Logan City',null,'AU',-27.63917,153.10944,282673),
(7302628,'Adelaide Hills',null,'AU',-34.91119,138.70735,60394),
(11523810,'Melbourne City Centre',null,'AU',-37.81501,144.96657,60057),
(5881791,'Abbotsford','BC','CA',49.05798,-122.25257,151683),
(5882873,'Ajax','ON','CA',43.85012,-79.03288,90167),
(5888377,'Aurora','ON','CA',44.00011,-79.46632,55445),
(5894171,'Barrie','ON','CA',44.40011,-79.66634,182041),
(5907364,'Brampton','ON','CA',43.68341,-79.76633,433806),
(5907990,'Brantford','ON','CA',43.1334,-80.26636,87759),
(5909629,'Brossard','QC','CA',45.45008,-73.46583,69575),
(5911592,'Burlington','ON','CA',43.38621,-79.83713,164415),
(5911606,'Burnaby','BC','CA',49.26636,-122.95263,202799),
(5913490,'Calgary','AB','CA',51.05011,-114.08529,1019942),
(5913695,'Cambridge','ON','CA',43.3601,-80.31269,120372),
(5921356,'Chilliwack','BC','CA',49.16638,-121.95257,77000),
(5927690,'Coquitlam','BC','CA',49.2846,-122.78217,140000),
(5935277,'Dartmouth','NS','CA',44.67134,-63.57719,101343),
(5937615,'Delta','BC','CA',49.14399,-122.9068,101668),
(5942845,'Drummondville','QC','CA',45.88336,-72.48241,59489),
(5946768,'Edmonton','AB','CA',53.55014,-113.46871,712391),
(5950267,'Etobicoke','ON','CA',43.65421,-79.56711,347948),
(5955895,'Fort McMurray','AB','CA',56.72676,-111.38103,76000),
(5957776,'Fredericton','NB','CA',45.94541,-66.66558,52337),
(5959974,'Gatineau','QC','CA',45.47723,-75.70164,242124),
(5964215,'Granby','QC','CA',45.40008,-72.73243,53979),
(5964700,'Greater Sudbury','ON','CA',46.49,-80.99001,157857),
(5967629,'Guelph','ON','CA',43.54594,-80.25599,115760),
(5969782,'Hamilton','ON','CA',43.25011,-79.84963,519949),
(5989045,'Kamloops','BC','CA',50.66648,-120.3192,68714),
(5989117,'Kanata','ON','CA',45.3001,-75.91606,90000),
(5990579,'Kelowna','BC','CA',49.88307,-119.48568,125109),
(5992500,'Kingston','ON','CA',44.22976,-76.48098,114195),
(5992996,'Kitchener','ON','CA',43.42537,-80.5112,233700),
(6050610,'Laval','QC','CA',45.56995,-73.692,376845),
(6053154,'Lethbridge','AB','CA',49.69999,-112.81856,70617),
(6058560,'London','ON','CA',42.98339,-81.23304,346765),
(6059891,'Longueuil','QC','CA',45.53121,-73.51806,229330),
(6065686,'Maple Ridge','BC','CA',49.21939,-122.60193,70000),
(6066513,'Markham','ON','CA',43.86682,-79.2663,261573),
(6071618,'Medicine Hat','AB','CA',50.03928,-110.67661,63138),
(6074377,'Milton','ON','CA',43.51681,-79.88294,101715),
(6075357,'Mississauga','ON','CA',43.5789,-79.6583,668549),
(6076211,'Moncton','NB','CA',46.09454,-64.7965,108620),
(6077243,'Montréal','QC','CA',45.50884,-73.58781,1600000),
(6085772,'Nanaimo','BC','CA',49.16638,-123.94003,84905),
(6087029,'Nepean','ON','CA',45.33619,-75.7225,180000),
(6087701,'Newmarket','ON','CA',44.05011,-79.46631,74295),
(6087844,'New Westminster','BC','CA',49.20678,-122.91092,58549),
(6087892,'Niagara Falls','ON','CA',43.10012,-79.06627,82000),
(6089125,'Norfolk County','ON','CA',42.8334,-80.38297,60847),
(6089426,'North Bay','ON','CA',46.3168,-79.46633,50396),
(6091104,'North York','ON','CA',43.76681,-79.4163,636000),
(6091314,'Notre-Dame-de-Grâce','QC','CA',45.47675,-73.61432,67000),
(6092122,'Oakville','ON','CA',43.45011,-79.68292,165697),
(6094578,'Oshawa','ON','CA',43.90012,-78.84957,308875),
(6094817,'Ottawa','ON','CA',45.41117,-75.69812,812129),
(6101645,'Peterborough','ON','CA',44.30012,-78.31623,75877),
(6104111,'Pickering','ON','CA',43.90012,-79.13289,87838),
(6111706,'Port Coquitlam','BC','CA',49.26637,-122.76932,58000),
(6113365,'Prince George','BC','CA',53.9166,-122.75301,65558),
(6118158,'Red Deer','AB','CA',52.26682,-113.802,73593),
(6119109,'Regina','SK','CA',50.45008,-104.6178,176183),
(6119518,'Repentigny','QC','CA',45.74222,-73.45008,76237),
(6122085,'Richmond','BC','CA',49.17003,-123.13683,182000),
(6122091,'Richmond Hill','ON','CA',43.87111,-79.43725,185541),
(6137270,'Saguenay','QC','CA',48.41675,-71.06573,143692),
(6138374,'Saint-Hyacinthe','QC','CA',45.63076,-72.95699,50326),
(6138495,'Saint-Jean-sur-Richelieu','QC','CA',45.30713,-73.26259,71613),
(6138501,'Saint-Jérôme','QC','CA',45.78036,-74.00365,54948),
(6138517,'Saint John','NB','CA',45.27076,-66.05616,87857),
(6138610,'Saint-Laurent','QC','CA',45.50008,-73.66585,77391),
(6138625,'Saint-Léonard','QC','CA',45.58773,-73.59501,73423),
(6141190,'Sarnia','ON','CA',42.97866,-82.40407,72125),
(6141256,'Saskatoon','SK','CA',52.13238,-106.66892,198958),
(6141439,'Sault Ste. Marie','ON','CA',46.51677,-84.33325,66313),
(6146143,'Sherbrooke','QC','CA',45.40008,-71.89908,129447),
(6146279,'Sherwood Park','AB','CA',53.51684,-113.3187,55063),
(6155033,'St. Albert','AB','CA',53.63344,-113.63533,57719),
(6155721,'St. Catharines','ON','CA',43.17126,-79.24267,131989),
(6159905,'Surrey','BC','CA',49.10635,-122.82509,394976),
(6163012,'Terrebonne','QC','CA',45.70004,-73.64732,94703),
(6166142,'Thunder Bay','ON','CA',48.38202,-89.25018,99334),
(6167865,'Toronto','ON','CA',43.70011,-79.4163,2600000),
(6169141,'Trois-Rivières','QC','CA',46.34515,-72.5477,119693),
(6173331,'Vancouver','BC','CA',49.24966,-123.11934,600000),
(6173577,'Vaughan','ON','CA',43.8361,-79.49827,238866),
(6174041,'Victoria','BC','CA',48.4359,-123.35155,289625),
(6176823,'Waterloo','ON','CA',43.4668,-80.51639,97475),
(6177869,'Welland','ON','CA',42.98342,-79.24958,50331),
(6180961,'White Rock','BC','CA',49.01636,-122.8026,66450),
(6182962,'Windsor','ON','CA',42.30008,-83.01654,278013),
(6183235,'Winnipeg','MB','CA',49.8844,-97.14704,632063),
(6324729,'Halifax','NS','CA',44.6464,-63.57291,359111),
(6324733,'St. John''s','NL','CA',47.56494,-52.70931,99182),
(6325494,'Québec','QC','CA',46.81228,-71.21454,528595),
(6325521,'Lévis','QC','CA',46.80326,-71.17793,126396),
(6354908,'Sydney','NS','CA',46.1351,-60.1831,105968),
(6948711,'Scarborough','ON','CA',43.77223,-79.25666,600000),
(7281931,'Okanagan','BC','CA',50.36386,-119.34997,297601),
(7303786,'Jonquière','QC','CA',48.41648,-71.24884,54842),
(7602078,'Ladner','BC','CA',49.08938,-123.08241,200000),
(7870925,'East York','ON','CA',43.69053,-79.32794,115365),
(8558534,'Willowdale','ON','CA',43.76672,-79.39909,79440),
(11838435,'La Haute-Saint-Charles','QC','CA',46.89028,-71.37222,74070),
(2633352,'York',null,'GB',53.95763,-1.08271,153717),
(2633485,'Wrexham',null,'GB',53.04664,-2.99132,65692),
(2633521,'Worthing',null,'GB',50.81795,-0.37538,99110),
(2633563,'Worcester',null,'GB',52.18935,-2.22001,101659),
(2633691,'Wolverhampton',null,'GB',52.58547,-2.12296,252791),
(2633709,'Woking',null,'GB',51.31903,-0.55893,103932),
(2633948,'Wigan',null,'GB',53.54296,-2.63706,175405),
(2633954,'Widnes',null,'GB',53.3618,-2.73406,61464),
(2634202,'Weymouth',null,'GB',50.61448,-2.45991,57691),
(2634308,'Weston-super-Mare',null,'GB',51.34603,-2.97665,82903),
(2634341,'City of Westminster',null,'GB',51.4975,-0.1357,247614),
(2634491,'West Bromwich',null,'GB',52.51868,-1.9945,135618),
(2634549,'Wembley',null,'GB',51.55242,-0.29686,90045),
(2634552,'Welwyn Garden City',null,'GB',51.80174,-0.20691,59910),
(2634578,'Wellingborough',null,'GB',52.30273,-0.69446,50577),
(2634677,'Watford',null,'GB',51.65531,-0.39602,125707),
(2634686,'Waterlooville',null,'GB',50.88067,-1.0304,64350),
(2634715,'Washington',null,'GB',54.9,-1.51667,53526),
(2634739,'Warrington',null,'GB',53.39254,-2.58024,165456),
(2634853,'Walsall',null,'GB',52.58528,-1.98396,172141),
(2634873,'Wallasey',null,'GB',53.42324,-3.06497,58794),
(2634910,'Wakefield',null,'GB',53.68331,-1.49768,78978),
(2635650,'Torquay',null,'GB',50.46198,-3.52522,65388),
(2636177,'Taunton',null,'GB',51.01494,-3.10293,64621),
(2636276,'Tamworth',null,'GB',52.63399,-1.69587,81964),
(2636389,'Swindon',null,'GB',51.55797,-1.78116,185609),
(2636432,'Swansea',null,'GB',51.62079,-3.94323,300352),
(2636486,'Sutton Coldfield',null,'GB',52.56667,-1.81667,107030),
(2636503,'Sutton',null,'GB',51.35,-0.2,187600),
(2636531,'Sunderland',null,'GB',54.90465,-1.38222,335415),
(2636616,'Stroud',null,'GB',51.75,-2.2,60155),
(2636769,'Stourbridge',null,'GB',52.45608,-2.14317,56284),
(2636841,'Stoke-on-Trent',null,'GB',53.00415,-2.18538,372775),
(2636876,'Stockton-on-Tees',null,'GB',54.56848,-1.3187,79957),
(2636882,'Stockport',null,'GB',53.40979,-2.15761,139052),
(2636940,'Stevenage',null,'GB',51.90224,-0.20256,90232),
(2637126,'Staines',null,'GB',51.43092,-0.50606,51040),
(2637142,'Stafford',null,'GB',52.80521,-2.11636,69217),
(2637329,'South Shields',null,'GB',54.99859,-1.4323,83655),
(2637343,'Southport',null,'GB',53.64581,-3.01008,91703),
(2637433,'Southend-on-Sea',null,'GB',51.53782,0.71433,295310),
(2637487,'Southampton',null,'GB',50.90395,-1.40428,246201),
(2637490,'Southall',null,'GB',51.50896,-0.3713,70000),
(2637546,'Solihull',null,'GB',52.41426,-1.78094,96267),
(2637627,'Slough',null,'GB',51.50949,-0.59541,163777),
(2637891,'Shrewsbury',null,'GB',52.71009,-2.75208,71715),
(2638077,'Sheffield',null,'GB',53.38297,-1.4659,685368),
(2638324,'Scunthorpe',null,'GB',53.57905,-0.65437,79977),
(2638419,'Scarborough',null,'GB',54.27966,-0.40443,61749),
(2638671,'Salford',null,'GB',53.48771,-2.29042,72750),
(2638678,'Sale',null,'GB',53.42519,-2.32443,55689),
(2638703,'Saint Peters',null,'GB',51.36667,1.41667,125370),
(2638785,'St Helens',null,'GB',53.45,-2.73333,102555),
(2638867,'St Albans',null,'GB',51.75,-0.33333,84561),
(2638960,'Runcorn',null,'GB',53.34174,-2.73124,62872),
(2638978,'Rugby',null,'GB',52.37092,-1.26417,73150),
(2639022,'Royal Tunbridge Wells',null,'GB',51.13321,0.26256,68910),
(2639093,'Rotherham',null,'GB',53.43012,-1.35678,117618),
(2639192,'Romford',null,'GB',51.57515,0.18582,95000),
(2639272,'Rochdale',null,'GB',53.61766,-2.1552,97550),
(2639447,'Rhondda',null,'GB',51.65896,-3.44885,59450),
(2639506,'Reigate',null,'GB',51.23736,-0.20582,52123),
(2639545,'Redhill',null,'GB',51.24048,-0.17044,51559),
(2639557,'Redditch',null,'GB',52.3065,-1.94569,84300),
(2639577,'Reading',null,'GB',51.45625,-0.97113,318014),
(2639842,'Purley',null,'GB',51.33678,-0.11201,72000),
(2639912,'Preston',null,'GB',53.76282,-2.70452,313332),
(2639996,'Portsmouth',null,'GB',50.79899,-1.09125,194150),
(2640101,'Poole',null,'GB',50.71429,-1.98458,150092),
(2640194,'Plymouth',null,'GB',50.37153,-4.14305,260203),
(2640354,'Peterborough',null,'GB',52.57364,-0.24777,163379),
(2640677,'Paisley',null,'GB',55.83173,-4.43254,76220),
(2640729,'Oxford',null,'GB',51.75222,-1.25596,171380),
(2641022,'Oldham',null,'GB',53.54051,-2.1183,104782),
(2641157,'Nuneaton',null,'GB',52.52323,-1.46523,92698),
(2641170,'Nottingham',null,'GB',52.9536,-1.15047,729977),
(2641181,'Norwich',null,'GB',52.62783,1.29834,213166),
(2641430,'Northampton',null,'GB',52.25,-0.88333,215963),
(2641520,'Newtownabbey',null,'GB',54.65983,-5.90858,63860),
(2641598,'Newport',null,'GB',51.58774,-2.99835,306844),
(2641673,'Newcastle upon Tyne',null,'GB',54.97328,-1.61396,192382),
(2641674,'Newcastle under Lyme',null,'GB',53,-2.23333,75794),
(2642189,'Morley',null,'GB',53.74013,-1.59877,57385),
(2642214,'Morecambe',null,'GB',54.06835,-2.86108,51644),
(2642465,'Milton Keynes',null,'GB',52.04172,-0.75583,229941),
(2642607,'Middlesbrough',null,'GB',54.57623,-1.23483,142707),
(2643044,'Margate',null,'GB',51.38132,1.38617,60134),
(2643097,'Mansfield',null,'GB',53.13333,-1.2,171958),
(2643123,'Manchester',null,'GB',53.48095,-2.23743,395515),
(2643179,'Maidstone',null,'GB',51.26667,0.51667,107627),
(2643186,'Maidenhead',null,'GB',51.52279,-0.71986,64831),
(2643266,'Macclesfield',null,'GB',53.26023,-2.12564,63954),
(2643339,'Luton',null,'GB',51.87967,-0.41748,258018),
(2643490,'Lowestoft',null,'GB',52.47523,1.75167,70945),
(2643567,'Loughborough',null,'GB',52.76667,-1.2,59932),
(2643734,'Londonderry County Borough',null,'GB',54.99721,-7.30917,87153),
(2643736,'Derry',null,'GB',54.9981,-7.30934,83652),
(2643743,'London',null,'GB',51.50853,-0.12574,7556900),
(2644204,'Livingston',null,'GB',55.90288,-3.52261,56570),
(2644210,'Liverpool',null,'GB',53.41058,-2.97794,864122),
(2644319,'Littlehampton',null,'GB',50.81137,-0.54078,58714),
(2644411,'Lisburn',null,'GB',54.52337,-6.03527,77506),
(2644487,'Lincoln',null,'GB',53.22683,-0.53792,114879),
(2644668,'Leicester',null,'GB',52.6386,-1.13169,508916),
(2644688,'Leeds',null,'GB',53.79648,-1.54785,455123),
(2644737,'Royal Leamington Spa',null,'GB',52.2852,-1.52,95172),
(2645418,'Kingswood',null,'GB',51.45278,-2.50833,64793),
(2645425,'Kingston upon Hull',null,'GB',53.7446,-0.33525,314018),
(2645724,'Kidderminster',null,'GB',52.38819,-2.25,57059),
(2645753,'Kettering',null,'GB',52.39836,-0.72571,63675),
(2645889,'Keighley',null,'GB',53.86791,-1.90664,50171),
(2646003,'Islington',null,'GB',51.53622,-0.10304,319143),
(2646057,'Ipswich',null,'GB',52.05917,1.15545,178835),
(2646329,'Huyton',null,'GB',53.4115,-2.83935,54738),
(2646458,'Huddersfield',null,'GB',53.64904,-1.78416,149017),
(2646504,'Hove',null,'GB',50.83088,-0.1672,75174),
(2646517,'Hounslow',null,'GB',51.46839,-0.36092,66292),
(2646557,'Horsham',null,'GB',51.06314,-0.32757,51472),
(2646914,'High Wycombe',null,'GB',51.62907,-0.74934,133204),
(2647074,'Hereford',null,'GB',52.05684,-2.71482,60415),
(2647138,'Hemel Hempstead',null,'GB',51.75368,-0.44975,85629),
(2647261,'Hayes',null,'GB',51.51579,-0.4234,50000),
(2647356,'Hastings',null,'GB',50.85519,0.57292,133422),
(2647400,'Hartlepool',null,'GB',54.68554,-1.21028,88855),
(2647428,'Harrogate',null,'GB',53.99078,-1.5373,89060),
(2647461,'Harlow',null,'GB',51.77655,0.11158,94365),
(2647570,'Hamilton',null,'GB',55.76667,-4.03333,53200),
(2647632,'Halifax',null,'GB',53.71667,-1.85,82624),
(2647639,'Halesowen',null,'GB',52.44859,-2.04938,55265),
(2647793,'Guildford',null,'GB',51.23536,-0.57427,71873),
(2647878,'Grimsby',null,'GB',53.56539,-0.07553,134160),
(2647984,'Great Yarmouth',null,'GB',52.60831,1.73052,63434),
(2648182,'Grays',null,'GB',51.47566,0.32521,89755),
(2648187,'Gravesend',null,'GB',51.44206,0.37106,54263),
(2648272,'Gosport',null,'GB',50.79509,-1.12902,70793),
(2648404,'Gloucester',null,'GB',51.86568,-2.2431,150053),
(2648579,'Glasgow',null,'GB',55.86515,-4.25763,591620),
(2648657,'Gillingham',null,'GB',51.38914,0.54863,101187),
(2648773,'Gateshead',null,'GB',54.96209,-1.60168,77649),
(2648970,'Fylde',null,'GB',53.83333,-2.91667,76500),
(2649258,'Folkestone',null,'GB',51.08169,1.16734,66429),
(2649672,'Farnborough',null,'GB',51.29424,-0.75565,59902),
(2649692,'Fareham',null,'GB',50.85162,-1.17929,57390),
(2649808,'Exeter',null,'GB',50.7236,-3.52751,117763),
(2649911,'Esher',null,'GB',51.36969,-0.36693,52392),
(2649997,'Enfield Town',null,'GB',51.65147,-0.08497,103970),
(2650096,'Ellesmere Port',null,'GB',53.27875,-2.90134,67768),
(2650225,'Edinburgh',null,'GB',55.95206,-3.19648,464990),
(2650396,'Eastleigh',null,'GB',50.96667,-1.35,54225),
(2650405,'East Kilbride',null,'GB',55.76412,-4.17669,74740),
(2650497,'Eastbourne',null,'GB',50.76871,0.28453,118219),
(2650657,'Dunstable',null,'GB',51.88571,-0.52288,51973),
(2650732,'Dunfermline',null,'GB',56.07156,-3.45887,50380),
(2650752,'Dundee',null,'GB',56.46913,-2.97489,147710),
(2650839,'Dudley',null,'GB',52.5,-2.08333,199059),
(2651123,'Doncaster',null,'GB',53.52285,-1.13116,158141),
(2651286,'Dewsbury',null,'GB',53.69076,-1.62907,56640),
(2651347,'Derby',null,'GB',52.92277,-1.47663,270468),
(2651500,'Dartford',null,'GB',51.44657,0.21423,56694),
(2651513,'Darlington',null,'GB',54.52429,-1.55039,92363),
(2651621,'Dagenham',null,'GB',51.55,0.16667,108368),
(2651715,'Cumbernauld',null,'GB',55.94685,-3.99051,51610),
(2651817,'Croydon',null,'GB',51.38333,-0.1,173314),
(2652002,'Crewe',null,'GB',53.09787,-2.44161,75556),
(2652053,'Crawley',null,'GB',51.11303,-0.18312,180508),
(2652221,'Coventry',null,'GB',52.40656,-1.51217,359262),
(2652381,'Corby',null,'GB',52.49637,-0.68939,56810),
(2652618,'Colchester',null,'GB',51.88921,0.90421,121859),
(2652974,'Clacton-on-Sea',null,'GB',51.78967,1.15597,50548),
(2653225,'Chesterfield',null,'GB',53.25,-1.41667,113057),
(2653228,'Chester',null,'GB',53.1905,-2.89189,90524),
(2653232,'Cheshunt',null,'GB',51.7002,-0.03026,57374),
(2653261,'Cheltenham',null,'GB',51.90006,-2.07972,116447),
(2653265,'Chelsea',null,'GB',51.48755,-0.16936,60000),
(2653266,'Chelmsford',null,'GB',51.73575,0.46958,111511),
(2653305,'Chatham',null,'GB',51.37891,0.52786,75509),
(2653558,'Castlereagh',null,'GB',54.5735,-5.88472,56679),
(2653584,'Castleford',null,'GB',53.72587,-1.36256,60509),
(2653775,'Carlisle',null,'GB',54.8951,-2.9382,78470),
(2653822,'Cardiff',null,'GB',51.48,-3.18,447287),
(2653877,'Canterbury',null,'GB',51.27904,1.07992,55240),
(2653883,'Cannock',null,'GB',52.69045,-2.03085,86121),
(2653941,'Cambridge',null,'GB',52.2,0.11667,158434),
(2654187,'Bury',null,'GB',53.6,-2.3,61044),
(2654200,'Burton upon Trent',null,'GB',52.80728,-1.64263,122199),
(2654264,'Burnley',null,'GB',53.8,-2.23333,149422),
(2654394,'Buckley',null,'GB',53.16667,-3.08333,63576),
(2654675,'Bristol',null,'GB',51.45523,-2.59665,617280),
(2654710,'Brighton',null,'GB',50.82838,-0.13947,139001),
(2654755,'Bridgend',null,'GB',51.50583,-3.57722,58380),
(2654782,'Brentwood',null,'GB',51.62127,0.30556,52586),
(2654789,'Brent',null,'GB',51.55306,-0.3023,329100),
(2654938,'Braintree',null,'GB',51.87819,0.55292,53477),
(2654993,'Bradford',null,'GB',53.79391,-1.75206,299310),
(2655009,'Bracknell',null,'GB',51.41363,-0.75054,76103),
(2655095,'Bournemouth',null,'GB',50.72048,-1.8795,163600),
(2655198,'Bootle',null,'GB',53.46667,-3.01667,57791),
(2655237,'Bolton',null,'GB',53.58333,-2.43333,141331),
(2655262,'Bognor Regis',null,'GB',50.78206,-0.67978,63885),
(2655351,'Bletchley',null,'GB',51.99334,-0.73471,50193),
(2655459,'Blackpool',null,'GB',53.81667,-3.05,239409),
(2655524,'Blackburn',null,'GB',53.75,-2.48333,146521),
(2655603,'Birmingham',null,'GB',52.48142,-1.89983,984333),
(2655613,'Birkenhead',null,'GB',53.39337,-3.01479,325264),
(2655775,'Bexley',null,'GB',51.44162,0.14866,228000),
(2655984,'Belfast',null,'GB',54.59682,-5.92541,274770),
(2656046,'Bedford',null,'GB',52.13459,-0.46632,106940),
(2656065,'Beckenham',null,'GB',51.40878,-0.02526,82000),
(2656168,'Batley',null,'GB',53.70291,-1.6337,50807),
(2656173,'Bath',null,'GB',51.3751,-2.36172,94782),
(2656192,'Basingstoke',null,'GB',51.26249,-1.08708,107642),
(2656194,'Basildon',null,'GB',51.56844,0.45782,144859),
(2656235,'Barry',null,'GB',51.39979,-3.2838,54673),
(2656284,'Barnsley',null,'GB',53.55,-1.48333,71447),
(2656333,'Barking',null,'GB',51.53333,0.08333,61000),
(2656396,'Bangor',null,'GB',54.65338,-5.66895,60385),
(2656719,'Aylesbury',null,'GB',51.81665,-0.81458,74748),
(2656955,'Ashford',null,'GB',51.14648,0.87376,62787),
(2657540,'Aldershot',null,'GB',51.24827,-0.76389,61339),
(2657697,'Acton',null,'GB',51.50901,-0.2762,53689),
(2657832,'Aberdeen',null,'GB',57.14369,-2.09814,196670),
(3209584,'Crosby',null,'GB',53.47778,-3.03333,52140),
(3345283,'Tonypandy',null,'GB',51.62202,-3.45544,62545),
(3345439,'Telford',null,'GB',52.67659,-2.44926,147980),
(3345440,'Craigavon',null,'GB',54.44709,-6.387,59236),
(6690602,'Battersea',null,'GB',51.47475,-0.15547,75651),
(6690862,'South Croydon',null,'GB',51.36217,-0.09421,55198),
(6690870,'Becontree',null,'GB',51.5529,0.129,100000),
(6690877,'Brixton',null,'GB',51.46593,-0.10652,66300),
(6692280,'Canary Wharf',null,'GB',51.50519,-0.02085,73390),
(6947756,'Mendip',null,'GB',51.2372,-2.6266,110000),
(8224580,'Peckham',null,'GB',51.47403,-0.06969,71552),
(8299614,'Rossendale',null,'GB',53.68456,-2.2769,67400),
(8299617,'High Peak',null,'GB',53.36797,-1.84536,92600),
(11777624,'Archway',null,'GB',51.56733,-0.13415,215667),
(2961284,'Tallaght',null,'IE',53.2859,-6.37344,64282),
(2962943,'Luimneach',null,'IE',52.66472,-8.62306,90054),
(2964180,'Gaillimh',null,'IE',53.27245,-9.05095,70686),
(2964574,'Dublin',null,'IE',53.33306,-6.24889,1024027),
(2965140,'Cork',null,'IE',51.89797,-8.47061,190384),
(2179537,'Wellington',null,'NZ',-41.28664,174.77557,381900),
(2184397,'Porirua',null,'NZ',-41.13333,174.85,50914),
(2185018,'Palmerston North',null,'NZ',-40.35636,175.61113,75996),
(2185964,'North Shore',null,'NZ',-36.8,174.75,207865),
(2186280,'Nelson',null,'NZ',-41.27078,173.28404,59200),
(2186313,'Napier',null,'NZ',-39.4926,176.91233,56787),
(2187404,'Manukau City',null,'NZ',-36.99282,174.87986,362000),
(2187454,'Mangere',null,'NZ',-36.96807,174.79875,55266),
(2188164,'Lower Hutt',null,'NZ',-41.21667,174.91667,101194),
(2190224,'Hastings',null,'NZ',-39.6381,176.84918,61696),
(2190324,'Hamilton',null,'NZ',-37.78333,175.28333,152641),
(2191562,'Dunedin',null,'NZ',-45.87416,170.50361,114347),
(2192362,'Christchurch',null,'NZ',-43.53333,172.63333,363926),
(2193733,'Auckland',null,'NZ',-36.84853,174.76349,417910),
(2208032,'Tauranga',null,'NZ',-37.68611,176.16667,110338),
(6230919,'Whangarei',null,'NZ',-35.73167,174.32391,50900),
(6241325,'Rotorua',null,'NZ',-38.13874,176.24516,65901),
(4048023,'Bessemer','AL','US',33.40178,-86.95444,26730),
(4048662,'Paducah','KY','US',37.08339,-88.60005,24864),
(4049979,'Birmingham','AL','US',33.52066,-86.80249,212461),
(4058219,'Daphne','AL','US',30.60353,-87.9036,24896),
(4058553,'Decatur','AL','US',34.60593,-86.98334,55437),
(4059102,'Dothan','AL','US',31.22323,-85.39049,68567),
(4059870,'East Florence','AL','US',34.80953,-87.64947,35733),
(4060791,'Enterprise','AL','US',31.31517,-85.85522,27978),
(4062577,'Florence','AL','US',34.79981,-87.67725,40026),
(4063619,'Gadsden','AL','US',34.01434,-86.00639,36084),
(4067927,'Homewood','AL','US',33.47177,-86.80082,25708),
(4067994,'Hoover','AL','US',33.40539,-86.81138,84848),
(4068590,'Huntsville','AL','US',34.7304,-86.58594,190582),
(4074267,'Madison','AL','US',34.69926,-86.74833,46962),
(4076598,'Mobile','AL','US',30.69436,-88.04305,194288),
(4076784,'Montgomery','AL','US',32.36681,-86.29997,200602),
(4078646,'Mountain Brook','AL','US',33.50094,-86.75221,20691),
(4080555,'Northport','AL','US',33.22901,-87.57723,24772),
(4081644,'Opelika','AL','US',32.64541,-85.37828,29527),
(4081914,'Oxford','AL','US',33.61427,-85.83496,21249),
(4082569,'Pelham','AL','US',33.28567,-86.80999,22885),
(4082866,'Phenix City','AL','US',32.47098,-85.00077,37570),
(4084796,'Prattville','AL','US',32.46402,-86.4597,35420),
(4084888,'Prichard','AL','US',30.7388,-88.07889,22351),
(4094212,'Trussville','AL','US',33.61983,-86.60888,21023),
(4094455,'Tuscaloosa','AL','US',33.20984,-87.56917,98332),
(4095415,'Vestavia Hills','AL','US',33.44872,-86.78777,34174),
(4101114,'Bella Vista','AR','US',36.4807,-94.27134,27999),
(4101241,'Benton','AR','US',34.56454,-92.58683,34177),
(4101260,'Bentonville','AR','US',36.37285,-94.20882,44499),
(4103957,'Cabot','AR','US',34.97453,-92.01653,25587),
(4106458,'Conway','AR','US',35.0887,-92.4421,64980),
(4110486,'Fayetteville','AR','US',36.06258,-94.15743,82830),
(4111410,'Fort Smith','AR','US',35.38592,-94.39855,88194),
(4115412,'Hot Springs','AR','US',34.5037,-93.05518,35635),
(4116315,'Jacksonville','AR','US',34.8662,-92.11015,28643),
(4116834,'Jonesboro','AR','US',35.8423,-90.70428,73907),
(4119403,'Little Rock','AR','US',34.74648,-92.28959,197992),
(4124112,'North Little Rock','AR','US',34.76954,-92.26709,66504),
(4125388,'Paragould','AR','US',36.0584,-90.49733,27900),
(4126226,'Pine Bluff','AR','US',34.22843,-92.0032,44772),
(4128894,'Rogers','AR','US',36.33202,-94.11854,63159),
(4129397,'Russellville','AR','US',35.27842,-93.13379,29166),
(4130430,'Searcy','AR','US',35.25064,-91.73625,24196),
(4132093,'Springdale','AR','US',36.18674,-94.12881,77859),
(4133367,'Texarkana','AR','US',33.44179,-94.03769,30353),
(4134716,'Van Buren','AR','US',35.43676,-94.34827,23081),
(4135865,'West Memphis','AR','US',35.14648,-90.18454,25052),
(4140963,'Washington, D.C.','DC','US',38.89511,-77.03637,601723),
(4142290,'Dover','DE','US',39.15817,-75.52437,37522),
(4143637,'Middletown','DE','US',39.44956,-75.71632,20372),
(4143861,'Newark','DE','US',39.68372,-75.74966,33817),
(4145381,'Wilmington','DE','US',39.74595,-75.54659,71948),
(4145805,'Allapattah','FL','US',25.81454,-80.22394,54289),
(4145941,'Altamonte Springs','FL','US',28.66111,-81.36562,43159),
(4146166,'Apopka','FL','US',28.67617,-81.51186,48382),
(4146429,'Aventura','FL','US',25.95648,-80.13921,37649),
(4146901,'Bayonet Point','FL','US',28.32667,-82.68343,23467),
(4147290,'Bellview','FL','US',30.46159,-87.31497,23355),
(4148207,'Bloomingdale','FL','US',27.89364,-82.24037,22711),
(4148399,'Boca Del Mar','FL','US',26.34508,-80.14671,24244),
(4148411,'Boca Raton','FL','US',26.35869,-80.0831,93235),
(4148533,'Bonita Springs','FL','US',26.33981,-81.7787,51704),
(4148677,'Boynton Beach','FL','US',26.52535,-80.06643,73966),
(4148708,'Bradenton','FL','US',27.49893,-82.57482,54437),
(4148757,'Brandon','FL','US',27.9378,-82.28592,103483),
(4148803,'Brent','FL','US',30.46881,-87.23608,21804),
(4149269,'Buenaventura Lakes','FL','US',28.33584,-81.35313,26079),
(4149956,'Cantonment','FL','US',30.60853,-87.33998,26493),
(4149962,'Cape Coral','FL','US',26.56285,-81.94953,175229),
(4150066,'Carol City','FL','US',25.94065,-80.2456,63031),
(4150115,'Carrollwood','FL','US',28.05002,-82.49287,33365),
(4150118,'Carrollwood Village','FL','US',28.06752,-82.52093,40949),
(4150190,'Casselberry','FL','US',28.67778,-81.32785,27056),
(4151157,'Citrus Park','FL','US',28.07835,-82.56982,24252),
(4151316,'Clearwater','FL','US',27.96585,-82.8001,113003),
(4151352,'Clermont','FL','US',28.54944,-81.77285,32390),
(4151455,'Coconut Creek','FL','US',26.25175,-80.17894,59302),
(4151460,'Coconut Grove','FL','US',25.7126,-80.25699,20076),
(4151824,'Cooper City','FL','US',26.05731,-80.27172,35364),
(4151871,'Coral Gables','FL','US',25.72149,-80.26838,51117),
(4151909,'Coral Springs','FL','US',26.27119,-80.2706,129485),
(4151921,'Coral Terrace','FL','US',25.74593,-80.3045,24376),
(4152093,'Country Club','FL','US',25.94815,-80.317,47105),
(4152311,'Crestview','FL','US',30.76213,-86.57051,23270),
(4152574,'Cutler Ridge','FL','US',25.58066,-80.34672,26831),
(4152772,'Dania Beach','FL','US',26.05231,-80.14393,31446),
(4152820,'Davie','FL','US',26.06287,-80.2331,100882),
(4152872,'Daytona Beach','FL','US',29.21081,-81.02283,64736),
(4152890,'DeLand','FL','US',29.02832,-81.30312,30195),
(4153071,'Deerfield Beach','FL','US',26.31841,-80.09977,79768),
(4153132,'Delray Beach','FL','US',26.46146,-80.07282,66255),
(4153146,'Deltona','FL','US',28.90054,-81.26367,88474),
(4153471,'Doral','FL','US',25.81954,-80.35533,56035),
(4153759,'Dunedin','FL','US',28.0199,-82.77323,36164),
(4154008,'East Lake','FL','US',28.11085,-82.69482,30962),
(4154031,'East Naples','FL','US',26.13842,-81.76648,22951),
(4154047,'East Pensacola Heights','FL','US',30.42881,-87.17997,54104),
(4154205,'Edgewater','FL','US',28.98888,-80.90228,21566),
(4154280,'Egypt Lake-Leto','FL','US',28.01769,-82.50619,35282),
(4154489,'Ensley','FL','US',30.51881,-87.27275,20602),
(4154568,'Estero','FL','US',26.43814,-81.80675,30799),
(4155017,'Ferry Pass','FL','US',30.5102,-87.21247,28921),
(4155529,'Flagami','FL','US',25.76232,-80.31616,50834),
(4155594,'Fleming Island','FL','US',30.0933,-81.71898,27126),
(4155966,'Fort Lauderdale','FL','US',26.12231,-80.14338,178590),
(4155995,'Fort Myers','FL','US',26.62168,-81.84059,74013),
(4156018,'Fort Pierce','FL','US',27.44671,-80.32561,44484),
(4156042,'Fort Walton Beach','FL','US',30.42059,-86.61707,21817),
(4156091,'Fountainebleau','FL','US',25.77288,-80.34783,59764),
(4156331,'Fruit Cove','FL','US',30.11107,-81.64176,29362)
on conflict (id) do nothing;
insert into places (id, name, state, country, lat, lng, population) values
(4156404,'Gainesville','FL','US',29.65163,-82.32483,130128),
(4156920,'Golden Gate','FL','US',26.18787,-81.69509,23961),
(4156931,'Golden Glades','FL','US',25.91176,-80.20033,33145),
(4157467,'Greenacres City','FL','US',26.62368,-80.12532,32963),
(4157827,'Haines City','FL','US',28.1145,-81.62009,22807),
(4157898,'Hallandale Beach','FL','US',25.9812,-80.14838,39488),
(4158476,'Hialeah','FL','US',25.8576,-80.27811,237069),
(4158482,'Hialeah Gardens','FL','US',25.8651,-80.3245,23926),
(4158865,'Holiday','FL','US',28.18779,-82.73955,22403),
(4158928,'Hollywood','FL','US',26.0112,-80.14949,149728),
(4159050,'Homestead','FL','US',25.46872,-80.47756,66498),
(4159553,'Immokalee','FL','US',26.41869,-81.4173,24154),
(4160021,'Jacksonville','FL','US',30.33218,-81.65565,868031),
(4160023,'Jacksonville Beach','FL','US',30.29469,-81.39314,23064),
(4160610,'Jupiter','FL','US',26.93422,-80.09421,62707),
(4160705,'Kendale Lakes','FL','US',25.70816,-80.407,56148),
(4160711,'Kendall','FL','US',25.67927,-80.31727,75371),
(4160812,'Key West','FL','US',24.55524,-81.78163,25755),
(4160822,'Keystone','FL','US',28.15585,-82.62121,24039),
(4160983,'Kissimmee','FL','US',28.30468,-81.41667,69152),
(4161313,'Lake Magdalene','FL','US',28.07418,-82.47176,28509),
(4161422,'Lake Worth','FL','US',26.61708,-80.07231,37498),
(4161424,'Lake Worth Corridor','FL','US',26.61649,-80.10102,20635),
(4161438,'Lakeland','FL','US',28.03947,-81.9498,104401),
(4161461,'Lakeside','FL','US',30.12996,-81.76815,30943),
(4161534,'Land O'' Lakes','FL','US',28.2189,-82.45759,31996),
(4161580,'Largo','FL','US',27.90979,-82.78842,81000),
(4161616,'Lauderdale Lakes','FL','US',26.16647,-80.20838,34796),
(4161625,'Lauderhill','FL','US',26.14036,-80.21338,71579),
(4161771,'Leesburg','FL','US',28.81082,-81.87786,21993),
(4161785,'Lehigh Acres','FL','US',26.62535,-81.6248,86784),
(4161797,'Leisure City','FL','US',25.49539,-80.42922,22655),
(4163049,'Lynn Haven','FL','US',30.24548,-85.64826,20156),
(4163407,'Margate','FL','US',26.24453,-80.20644,57234),
(4163918,'Meadow Woods','FL','US',28.38556,-81.36646,25558),
(4163971,'Melbourne','FL','US',28.08363,-80.60811,80127),
(4164092,'Merritt Island','FL','US',28.53917,-80.672,34743),
(4164138,'Miami','FL','US',25.77427,-80.19366,441003),
(4164143,'Miami Beach','FL','US',25.79065,-80.13005,92312),
(4164167,'Miami Gardens','FL','US',25.94204,-80.2456,113187),
(4164186,'Miami Lakes','FL','US',25.90871,-80.30866,30972),
(4164601,'Miramar','FL','US',25.98731,-80.23227,137132),
(4165565,'Naples','FL','US',26.14234,-81.79596,21512),
(4165637,'Navarre','FL','US',30.40159,-86.86357,31378),
(4165913,'New Smyrna Beach','FL','US',29.02582,-80.927,24298),
(4166066,'Norland','FL','US',25.94898,-80.21227,23604),
(4166195,'North Fort Myers','FL','US',26.66729,-81.88009,39407),
(4166222,'North Lauderdale','FL','US',26.2173,-80.22588,43703),
(4166232,'North Miami','FL','US',25.89009,-80.18671,62435),
(4166233,'North Miami Beach','FL','US',25.93315,-80.16255,43971),
(4166274,'North Port','FL','US',27.04422,-82.23593,62345),
(4166583,'Oak Ridge','FL','US',28.47112,-81.42452,22685),
(4166638,'Oakland Park','FL','US',26.17231,-80.13199,44319),
(4166673,'Ocala','FL','US',29.1872,-82.14009,58218),
(4166776,'Ocoee','FL','US',28.56917,-81.54396,43608),
(4167147,'Orlando','FL','US',28.53834,-81.37924,270934),
(4167178,'Ormond Beach','FL','US',29.28581,-81.05589,40970),
(4167348,'Oviedo','FL','US',28.67,-81.20812,38551),
(4167424,'Pace','FL','US',30.59936,-87.16108,20039),
(4167499,'Palm Bay','FL','US',28.03446,-80.58866,107888),
(4167519,'Palm Beach Gardens','FL','US',26.82339,-80.13865,52923),
(4167536,'Palm City','FL','US',27.16783,-80.26616,23120),
(4167538,'Palm Coast','FL','US',29.58497,-81.20784,82893),
(4167545,'Palm Harbor','FL','US',28.07807,-82.76371,57439),
(4167583,'Palm Springs','FL','US',26.6359,-80.09615,22341),
(4167601,'Palm Valley','FL','US',30.17746,-81.38758,20019),
(4167634,'Palmetto Bay','FL','US',25.62177,-80.32477,24642),
(4167694,'Panama City','FL','US',30.15946,-85.65983,38286),
(4167829,'Parkland','FL','US',26.31008,-80.23727,30177),
(4168139,'Pembroke Pines','FL','US',26.00315,-80.22394,166611),
(4168228,'Pensacola','FL','US',30.42131,-87.21691,53193),
(4168459,'Pine Hills','FL','US',28.55778,-81.4534,60076),
(4168630,'Pinellas Park','FL','US',27.8428,-82.69954,51617),
(4168773,'Plant City','FL','US',28.01888,-82.11469,37406),
(4168782,'Plantation','FL','US',26.13421,-80.23184,92560),
(4168930,'Poinciana','FL','US',28.14029,-81.45841,53193),
(4169014,'Pompano Beach','FL','US',26.23786,-80.12477,107762),
(4169060,'Ponte Vedra Beach','FL','US',30.23969,-81.38564,35400),
(4169130,'Port Charlotte','FL','US',26.97617,-82.09064,54392),
(4169156,'Port Orange','FL','US',29.13832,-80.99561,59866),
(4169171,'Port Saint Lucie','FL','US',27.29393,-80.35033,164603),
(4169345,'Princeton','FL','US',25.53844,-80.40894,22038),
(4170005,'Richmond West','FL','US',25.6105,-80.42971,31973),
(4170156,'Riverview','FL','US',27.86614,-82.32648,71050),
(4170174,'Riviera Beach','FL','US',26.77534,-80.0581,34005),
(4170358,'Rockledge','FL','US',28.35084,-80.72533,24926),
(4170617,'Royal Palm Beach','FL','US',26.7084,-80.2306,37633),
(4170965,'Saint Cloud','FL','US',28.2489,-81.28118,35183),
(4171563,'St. Petersburg','FL','US',27.77086,-82.67927,257083),
(4172086,'Sanford','FL','US',28.80055,-81.27312,58111),
(4172131,'Sarasota','FL','US',27.33643,-82.53065,55118),
(4172372,'Sebastian','FL','US',27.81641,-80.47061,24007),
(4173392,'South Bradenton','FL','US',27.4631,-82.58176,22178),
(4173497,'South Miami Heights','FL','US',25.59761,-80.38061,35696),
(4173838,'Spring Hill','FL','US',28.47688,-82.52546,98621),
(4174383,'Sunny Isles Beach','FL','US',25.95065,-80.12282,22123),
(4174402,'Sunrise','FL','US',26.13397,-80.1131,84439),
(4174600,'Sweetwater','FL','US',25.76343,-80.37311,20840),
(4174715,'Tallahassee','FL','US',30.43826,-84.28073,189907),
(4174738,'Tamarac','FL','US',26.21286,-80.24977,64681),
(4174744,'Tamiami','FL','US',25.75871,-80.39839,55271),
(4174757,'Tampa','FL','US',27.94752,-82.45843,369075),
(4174855,'Tarpon Springs','FL','US',28.14612,-82.75677,24605),
(4174969,'Temple Terrace','FL','US',28.0353,-82.38926,25731),
(4175091,'The Crossings','FL','US',25.67066,-80.40117,22758),
(4175117,'The Hammocks','FL','US',25.67149,-80.4445,51003),
(4175179,'The Villages','FL','US',28.93408,-81.95994,51442),
(4175437,'Titusville','FL','US',28.61222,-80.80755,45393),
(4175538,'Town ''n'' Country','FL','US',28.01057,-82.57732,78442),
(4176217,'University Park','FL','US',25.74649,-80.36755,26995),
(4176318,'Valrico','FL','US',27.93789,-82.23644,35545),
(4176380,'Venice','FL','US',27.09978,-82.45426,22211),
(4177671,'Wekiwa Springs','FL','US',28.69861,-81.42563,21998),
(4177703,'Wellington','FL','US',26.65868,-80.24144,62560),
(4177727,'Wesley Chapel','FL','US',28.23973,-82.32787,44092),
(4177779,'Westchase','FL','US',28.05502,-82.60982,21747),
(4177834,'West Hollywood','FL','US',26.02065,-80.18394,60806),
(4177865,'West Little River','FL','US',25.85704,-80.23699,34699),
(4177872,'West Melbourne','FL','US',28.07168,-80.65339,20679),
(4177887,'West Palm Beach','FL','US',26.71534,-80.05337,106779),
(4177908,'West Pensacola','FL','US',30.42659,-87.27969,21339),
(4177960,'West and East Lealman','FL','US',27.81993,-82.68944,21924),
(4177965,'Westchester','FL','US',25.75482,-80.32727,29862),
(4178003,'Weston','FL','US',26.10037,-80.39977,69959),
(4178550,'Winter Garden','FL','US',28.56528,-81.58618,40356),
(4178552,'Winter Haven','FL','US',28.02224,-81.73286,37689),
(4178560,'Winter Park','FL','US',28.6,-81.33924,29943),
(4178573,'Winter Springs','FL','US',28.69889,-81.30812,34789),
(4178775,'Wright','FL','US',30.45575,-86.63829,23127),
(4179074,'Acworth','GA','US',34.06635,-84.67837,22131),
(4179320,'Albany','GA','US',31.57851,-84.15574,74843),
(4179574,'Alpharetta','GA','US',34.07538,-84.29409,63693),
(4180386,'Athens','GA','US',33.96095,-83.37794,116714),
(4180439,'Atlanta','GA','US',33.749,-84.38798,463878),
(4180531,'Augusta','GA','US',33.47097,-81.97484,43459),
(4184530,'Brookhaven','GA','US',33.85844,-84.3402,51910),
(4186213,'Canton','GA','US',34.23676,-84.49076,25469),
(4186416,'Carrollton','GA','US',33.58011,-85.07661,26203),
(4186531,'Cartersville','GA','US',34.16533,-84.80231,20319),
(4187204,'Chamblee','GA','US',33.89205,-84.29881,28244),
(4188985,'Columbus','GA','US',32.46098,-84.98771,200579),
(4190581,'Dalton','GA','US',34.7698,-84.97022,33853),
(4191124,'Decatur','GA','US',33.77483,-84.29631,21957),
(4191955,'Douglasville','GA','US',33.7515,-84.74771,32897),
(4192289,'Duluth','GA','US',34.00288,-84.14464,29193),
(4192375,'Dunwoody','GA','US',33.94621,-84.33465,48733),
(4192674,'East Point','GA','US',33.67955,-84.43937,35467),
(4193699,'Evans','GA','US',33.53375,-82.13067,29011),
(4196586,'Gainesville','GA','US',34.29788,-83.82407,38712),
(4198322,'Griffin','GA','US',33.24678,-84.26409,23211),
(4200671,'Hinesville','GA','US',31.84688,-81.59595,33398),
(4203696,'Kennesaw','GA','US',34.02343,-84.61549,33584),
(4204230,'LaGrange','GA','US',33.03929,-85.03133,29588),
(4205196,'Lawrenceville','GA','US',33.95621,-83.98796,30493),
(4207226,'Mableton','GA','US',33.81872,-84.58243,37115),
(4207400,'Macon','GA','US',32.84069,-83.6324,91351),
(4207783,'Marietta','GA','US',33.9526,-84.54993,59067),
(4207981,'Martinez','GA','US',33.51736,-82.07567,35795),
(4208442,'McDonough','GA','US',33.44734,-84.14686,23417),
(4212684,'Newnan','GA','US',33.38067,-84.79966,37291),
(4212937,'North Atlanta','GA','US',33.8651,-84.33659,40456),
(4215110,'Peachtree City','GA','US',33.39678,-84.59576,35240),
(4215114,'Peachtree Corners','GA','US',33.9701,-84.22159,40978),
(4216948,'Pooler','GA','US',32.11548,-81.24706,23133),
(4218165,'Redan','GA','US',33.74538,-84.13158,33015),
(4219762,'Rome','GA','US',34.25704,-85.16467,36323),
(4219934,'Roswell','GA','US',34.02316,-84.36159,94501),
(4221333,'Sandy Springs','GA','US',33.92427,-84.37854,105330),
(4221552,'Savannah','GA','US',32.08354,-81.09983,145674),
(4223379,'Smyrna','GA','US',33.88399,-84.51438,56146),
(4224413,'Statesboro','GA','US',32.44879,-81.78317,30721),
(4224681,'Stockbridge','GA','US',33.54428,-84.23381,28202),
(4225039,'Sugar Hill','GA','US',34.10649,-84.03352,21747),
(4227213,'Tucker','GA','US',33.85455,-84.21714,27581),
(4227777,'Union City','GA','US',33.58706,-84.54243,20805),
(4228147,'Valdosta','GA','US',30.83334,-83.28032,55724),
(4229476,'Warner Robins','GA','US',32.61574,-83.62664,73490),
(4231874,'Woodstock','GA','US',34.10149,-84.51938,29898),
(4232679,'Alton','IL','US',38.8906,-90.18428,27003),
(4233813,'Belleville','IL','US',38.52005,-89.98399,42034),
(4235193,'Carbondale','IL','US',37.72727,-89.21675,26399),
(4235668,'Charleston','IL','US',39.49615,-88.17615,21196),
(4236191,'Collinsville','IL','US',38.67033,-89.98455,24754),
(4236895,'Decatur','IL','US',39.84031,-88.9548,73254),
(4237579,'East Saint Louis','IL','US',38.6245,-90.15094,27006),
(4237717,'Edwardsville','IL','US',38.81144,-89.95316,24992),
(4239714,'Granite City','IL','US',38.70144,-90.14872,29054),
(4245926,'O''Fallon','IL','US',38.59227,-89.91121,29002),
(4247703,'Quincy','IL','US',39.9356,-91.40987,40780),
(4250542,'Springfield','IL','US',39.80172,-89.64371,116565),
(4251841,'Upper Alton','IL','US',38.91144,-90.15066,29251),
(4254679,'Bloomington','IN','US',39.16533,-86.52639,84067),
(4255056,'Brownsburg','IN','US',39.84338,-86.39777,24996),
(4255466,'Carmel','IN','US',39.97837,-86.11804,88713),
(4255836,'Clarksville','IN','US',38.29674,-85.75996,21866),
(4256038,'Columbus','IN','US',39.20144,-85.92138,46690),
(4257227,'Evansville','IN','US',37.97476,-87.55585,119943),
(4257494,'Fishers','IN','US',39.95559,-86.01387,76794),
(4258285,'Greenfield','IN','US',39.78504,-85.76942,21497),
(4258313,'Greenwood','IN','US',39.61366,-86.10665,55586),
(4259418,'Indianapolis','IN','US',39.76838,-86.15804,829718),
(4259671,'Jeffersonville','IN','US',38.27757,-85.73718,46960),
(4260210,'Lawrence','IN','US',39.83865,-86.02526,47809),
(4262045,'New Albany','IN','US',38.28562,-85.82413,36732),
(4263108,'Plainfield','IN','US',39.70421,-86.39944,30590),
(4263681,'Richmond','IN','US',39.82894,-84.89024,35854),
(4265737,'Terre Haute','IN','US',39.4667,-87.41391,60825),
(4267336,'Zionsville','IN','US',39.95087,-86.26194,26296),
(4270356,'Derby','KS','US',37.54557,-97.26893,23509),
(4271086,'Emporia','KS','US',38.4039,-96.18166,24649),
(4271935,'Gardner','KS','US',38.81084,-94.92719,20868),
(4272782,'Hays','KS','US',38.87918,-99.32677,21092),
(4273299,'Hutchinson','KS','US',38.06084,-97.92977,41569),
(4273680,'Junction City','KS','US',39.02861,-96.8314,24621),
(4273837,'Kansas City','KS','US',39.11417,-94.62746,151306),
(4274277,'Lawrence','KS','US',38.97167,-95.23525,93917),
(4274305,'Leavenworth','KS','US',39.31111,-94.92246,35980),
(4274317,'Leawood','KS','US',38.96667,-94.6169,34579),
(4274356,'Lenexa','KS','US',38.95362,-94.73357,52490),
(4274994,'Manhattan','KS','US',39.18361,-96.57167,56308),
(4276614,'Olathe','KS','US',38.8814,-94.81913,134305),
(4276873,'Overland Park','KS','US',38.98223,-94.67079,186515),
(4277241,'Pittsburg','KS','US',37.41088,-94.70496,20409),
(4277718,'Prairie Village','KS','US',38.99167,-94.63357,21877),
(4278890,'Salina','KS','US',38.84028,-97.61142,47813),
(4279247,'Shawnee','KS','US',39.04167,-94.72024,65046),
(4280539,'Topeka','KS','US',39.04833,-95.67804,127265),
(4281730,'Wichita','KS','US',37.69224,-97.33754,389965),
(4282757,'Ashland','KY','US',38.47841,-82.63794,21108),
(4285268,'Bowling Green','KY','US',36.99032,-86.4436,63616),
(4288809,'Covington','KY','US',39.08367,-84.50855,40997),
(4290988,'Elizabethtown','KY','US',37.69395,-85.85913,29678),
(4291945,'Florence','KY','US',38.99895,-84.62661,32227),
(4292188,'Frankfort','KY','US',38.20091,-84.87328,27830),
(4292686,'Georgetown','KY','US',38.2098,-84.55883,32356),
(4294494,'Henderson','KY','US',37.83615,-87.59001,28890),
(4295251,'Hopkinsville','KY','US',36.86561,-87.49117,32205),
(4295776,'Independence','KY','US',38.94312,-84.54411,26819),
(4295940,'Ironville','KY','US',38.45647,-82.69238,288649),
(4296218,'Jeffersontown','KY','US',38.19424,-85.5644,26946),
(4297983,'Lexington','KY','US',37.98869,-84.47772,225366),
(4297999,'Lexington-Fayette','KY','US',38.0498,-84.45855,314488),
(4299276,'Louisville','KY','US',38.25424,-85.75941,243639),
(4300488,'Meads','KY','US',38.41258,-82.70905,288649),
(4302561,'Nicholasville','KY','US',37.88063,-84.573,29754),
(4303436,'Owensboro','KY','US',37.77422,-87.11333,59042),
(4304713,'Pleasure Ridge Park','KY','US',38.14535,-85.8583,25813),
(4305504,'Radcliff','KY','US',37.84035,-85.94913,22387),
(4305974,'Richmond','KY','US',37.74786,-84.29465,33533),
(4311963,'Valley Station','KY','US',38.11118,-85.87024,22756),
(4314550,'Alexandria','LA','US',31.31129,-92.44514,47889),
(4315588,'Baton Rouge','LA','US',30.44332,-91.18747,228590),
(4317639,'Bossier City','LA','US',32.51599,-93.73212,68094),
(4319435,'Central','LA','US',30.55435,-91.03677,28295),
(4326868,'Hammond','LA','US',30.50463,-90.46293,20480),
(4327047,'Harvey','LA','US',29.90354,-90.07729,20348),
(4328010,'Houma','LA','US',29.59577,-90.71953,34287),
(4329753,'Kenner','LA','US',29.99409,-90.24174,67091),
(4330145,'Lafayette','LA','US',30.22409,-92.01984,127657),
(4330236,'Lake Charles','LA','US',30.21309,-93.2044,76070),
(4330525,'Laplace','LA','US',30.06698,-90.48147,29872),
(4332628,'Marrero','LA','US',29.89937,-90.10035,33141),
(4333177,'Metairie','LA','US',29.98409,-90.15285,138481),
(4333190,'Metairie Terrace','LA','US',29.97854,-90.16396,142489),
(4333669,'Monroe','LA','US',32.50931,-92.1193,49598),
(4334971,'New Iberia','LA','US',30.00354,-91.81873,30754),
(4335045,'New Orleans','LA','US',29.95465,-90.07507,389617),
(4338012,'Prairieville','LA','US',30.30297,-90.97205,26895),
(4339348,'Ruston','LA','US',32.52321,-92.63793,22340),
(4341513,'Shreveport','LA','US',32.52515,-93.75018,197204),
(4341727,'Slidell','LA','US',30.27519,-89.78117,27942),
(4342816,'Sulphur','LA','US',30.23659,-93.37738,20189),
(4343327,'Terrytown','LA','US',29.91021,-90.03257,23319),
(4347242,'Annapolis','MD','US',38.97859,-76.49184,39474),
(4347371,'Arbutus','MD','US',39.25455,-76.69997,20483),
(4347426,'Arnold','MD','US',39.03206,-76.50274,23106),
(4347553,'Aspen Hill','MD','US',39.07955,-77.07303,48759),
(4347778,'Baltimore','MD','US',39.29038,-76.61219,621849),
(4348599,'Bethesda','MD','US',38.98067,-77.10026,60858),
(4349159,'Bowie','MD','US',38.94278,-76.73028,58025),
(4350413,'Carney','MD','US',39.39427,-76.52358,29941),
(4350635,'Catonsville','MD','US',39.27205,-76.73192,41567),
(4351383,'Chillum','MD','US',38.96372,-76.99081,33513),
(4351871,'Clinton','MD','US',38.76511,-76.89831,35970),
(4351887,'Cockeysville','MD','US',39.48122,-76.64386,20776),
(4351977,'College Park','MD','US',38.98067,-76.93692,32301),
(4352053,'Columbia','MD','US',39.24038,-76.83942,99615),
(4352539,'Crofton','MD','US',39.00178,-76.68747,27348),
(4352681,'Cumberland','MD','US',39.65287,-78.76252,20130),
(4353765,'Dundalk','MD','US',39.25066,-76.52052,63597),
(4354087,'Edgewood','MD','US',39.41872,-76.2944,25562),
(4354163,'Eldersburg','MD','US',39.40371,-76.95026,30531),
(4354265,'Ellicott City','MD','US',39.26733,-76.79831,65834),
(4354428,'Essex','MD','US',39.30927,-76.47496,39262),
(4354573,'Fairland','MD','US',39.07622,-76.95775,23681),
(4355355,'Fort Washington','MD','US',38.70734,-77.02303,23717),
(4355585,'Frederick','MD','US',39.41427,-77.41054,69479),
(4355843,'Gaithersburg','MD','US',39.14344,-77.20137,67456),
(4356050,'Germantown','MD','US',39.17316,-77.27165,86395),
(4356188,'Glen Burnie','MD','US',39.16261,-76.62469,67639),
(4356847,'Greenbelt','MD','US',39.00455,-76.87553,24272),
(4357141,'Hagerstown','MD','US',39.64176,-77.71999,40432),
(4357340,'Hanover','MD','US',39.19289,-76.72414,38088),
(4358701,'Hunt Valley','MD','US',39.49983,-76.64108,23915),
(4358864,'Ilchester','MD','US',39.25094,-76.76469,23476),
(4360287,'Landover','MD','US',38.934,-76.89664,23078),
(4360369,'Laurel','MD','US',39.09928,-76.84831,26215),
(4360954,'Lochearn','MD','US',39.34066,-76.72219,25333),
(4362344,'Middle River','MD','US',39.33427,-76.43941,25191),
(4362438,'Milford Mill','MD','US',39.34788,-76.76997,29042),
(4362743,'Montgomery Village','MD','US',39.17677,-77.19526,32032),
(4363836,'North Bel Air','MD','US',39.53983,-76.35496,33925),
(4363843,'North Bethesda','MD','US',39.04455,-77.11887,43828),
(4363990,'North Potomac','MD','US',39.08289,-77.26498,24410),
(4364362,'Odenton','MD','US',39.084,-76.70025,37132),
(4364537,'Olney','MD','US',39.15316,-77.06692,33844),
(4364727,'Owings Mills','MD','US',39.41955,-76.78025,30622),
(4364946,'Parkville','MD','US',39.37733,-76.53969,30734),
(4364990,'Pasadena','MD','US',39.10733,-76.57108,24287),
(4365227,'Perry Hall','MD','US',39.41261,-76.46357,28474),
(4365387,'Pikesville','MD','US',39.37427,-76.72247,30764),
(4366001,'Potomac','MD','US',39.01817,-77.20859,44965),
(4366476,'Randallstown','MD','US',39.36733,-76.79525,32430),
(4366647,'Reisterstown','MD','US',39.46976,-76.8319,25968),
(4367175,'Rockville','MD','US',39.084,-77.15276,66980),
(4367734,'Saint Charles','MD','US',38.60317,-76.93858,36376),
(4368711,'Salisbury','MD','US',38.36067,-75.59937,32899),
(4368918,'Scaggsville','MD','US',39.14511,-76.90025,24333),
(4369190,'Severn','MD','US',39.13705,-76.6983,44231),
(4369224,'Severna Park','MD','US',39.07039,-76.54524,37634),
(4369596,'Silver Spring','MD','US',38.99067,-77.02609,71452),
(4369928,'South Bel Air','MD','US',39.53316,-76.33746,48828),
(4369964,'South Gate','MD','US',39.129,-76.6258,29658),
(4369978,'South Laurel','MD','US',39.06983,-76.85025,26112),
(4370616,'Suitland','MD','US',38.84872,-76.92386,25825),
(4371582,'Towson','MD','US',39.4015,-76.60191,55197),
(4372599,'Waldorf','MD','US',38.62456,-76.93914,67752),
(4373104,'West Elkridge','MD','US',39.20705,-76.72692,28734),
(4373349,'Wheaton','MD','US',39.03983,-77.05526,48284),
(4374054,'Woodlawn','MD','US',39.32288,-76.72803,37879),
(4374513,'Affton','MO','US',38.55061,-90.33317,20307),
(4375087,'Arnold','MO','US',38.43283,-90.37762,21357),
(4375663,'Ballwin','MO','US',38.59505,-90.54623,30577),
(4376482,'Belton','MO','US',38.81195,-94.5319,23168),
(4377664,'Blue Springs','MO','US',39.01695,-94.28161,54148),
(4379966,'Cape Girardeau','MO','US',37.30588,-89.51815,39462),
(4381072,'Chesterfield','MO','US',38.66311,-90.57707,47864),
(4381982,'Columbia','MO','US',38.95171,-92.33407,119108),
(4385018,'East Independence','MO','US',39.09556,-94.35523,110675),
(4386387,'Ferguson','MO','US',38.74422,-90.30539,21059),
(4386802,'Florissant','MO','US',38.78922,-90.32261,52268),
(4387990,'Gladstone','MO','US',39.20389,-94.55468,26861),
(4388460,'Grandview','MO','US',38.88584,-94.53301,25256),
(4389967,'Hazelwood','MO','US',38.77144,-90.37095,25661),
(4391812,'Independence','MO','US',39.09112,-94.41551,117255),
(4392388,'Jefferson City','MO','US',38.5767,-92.17352,43169),
(4392768,'Joplin','MO','US',37.08423,-94.51328,51818),
(4393217,'Kansas City','MO','US',39.09973,-94.57857,475378),
(4393739,'Kirkwood','MO','US',38.58339,-90.40678,27750),
(4394870,'Lee''s Summit','MO','US',38.91084,-94.38217,95094),
(4395052,'Liberty','MO','US',39.24611,-94.41912,30450),
(4397340,'Maryland Heights','MO','US',38.71311,-90.42984,27389),
(4397962,'Mehlville','MO','US',38.50839,-90.32289,28380),
(4400648,'Nixa','MO','US',37.04339,-93.29435,20984),
(4401242,'O''Fallon','MO','US',38.81061,-90.69985,85040),
(4401618,'Oakville','MO','US',38.47005,-90.30456,36143),
(4405180,'Raymore','MO','US',38.80195,-94.45273,20374),
(4405188,'Raytown','MO','US',39.00862,-94.46356,29401),
(4406282,'Rolla','MO','US',37.95143,-91.77127,20019),
(4406831,'Saint Charles','MO','US',38.78394,-90.48123,65794),
(4407010,'Saint Joseph','MO','US',39.76861,-94.84663,76780),
(4407066,'St. Louis','MO','US',38.62727,-90.19789,315685),
(4407237,'Saint Peters','MO','US',38.80033,-90.62651,52575),
(4408000,'Sedalia','MO','US',38.70446,-93.22826,21516),
(4409896,'Springfield','MO','US',37.21533,-93.29824,166810),
(4412697,'University City','MO','US',38.65588,-90.30928,35058),
(4413872,'Webster Groves','MO','US',38.59255,-90.35734,23177),
(4414001,'Wentzville','MO','US',38.81144,-90.85291,35603),
(4414749,'Wildwood','MO','US',38.58283,-90.6629,35899),
(4418478,'Biloxi','MS','US',30.39603,-88.88531,45637),
(4419290,'Brandon','MS','US',32.2732,-89.98592,23529),
(4422133,'Clinton','MS','US',32.34153,-90.32176,25254),
(4422442,'Columbus','MS','US',33.49567,-88.42726,23168),
(4428475,'Greenville','MS','US',33.40898,-91.05978,32156),
(4428667,'Gulfport','MS','US',30.36742,-89.09282,71856),
(4429295,'Hattiesburg','MS','US',31.32712,-89.29034,46805),
(4430400,'Horn Lake','MS','US',34.95537,-90.03481,26915),
(4431410,'Jackson','MS','US',32.29876,-90.18481,170674),
(4434663,'Madison','MS','US',32.46181,-90.11536,25799),
(4435764,'Meridian','MS','US',32.36431,-88.70366,39661),
(4439869,'Olive Branch','MS','US',34.96176,-89.82953,36010),
(4440076,'Oxford','MS','US',34.3665,-89.51925,22314),
(4440397,'Pascagoula','MS','US',30.36576,-88.55613,22126),
(4440559,'Pearl','MS','US',32.27459,-90.13203,26462),
(4443296,'Ridgeland','MS','US',32.42848,-90.13231,24351),
(4446675,'Southaven','MS','US',34.98898,-90.01259,52589),
(4447161,'Starkville','MS','US',33.45049,-88.81961,25366),
(4448903,'Tupelo','MS','US',34.25807,-88.70464,35680),
(4449620,'Vicksburg','MS','US',32.35265,-90.87788,23131),
(4450687,'West Gulfport','MS','US',30.40409,-89.0942,71329),
(4452808,'Apex','NC','US',35.73265,-78.85029,45585),
(4453035,'Asheboro','NC','US',35.70791,-79.81364,26103),
(4453066,'Asheville','NC','US',35.60095,-82.55402,88512),
(4458228,'Burlington','NC','US',36.09569,-79.4378,52472),
(4459343,'Carrboro','NC','US',35.91014,-79.07529,21156),
(4459467,'Cary','NC','US',35.79154,-78.78112,159769),
(4460162,'Chapel Hill','NC','US',35.9132,-79.05584,59568),
(4460243,'Charlotte','NC','US',35.22709,-80.84313,827097),
(4461574,'Concord','NC','US',35.40888,-80.58158,87696),
(4461941,'Cornelius','NC','US',35.4868,-80.86007,28092),
(4464368,'Durham','NC','US',35.99403,-78.89862,257636),
(4466033,'Fayetteville','NC','US',35.05266,-78.87836,201963),
(4467485,'Fuquay-Varina','NC','US',35.58432,-78.80001,23907),
(4467657,'Garner','NC','US',35.71126,-78.61417,28053),
(4467732,'Gastonia','NC','US',35.26208,-81.1873,74543),
(4468261,'Goldsboro','NC','US',35.38488,-77.99277,35826),
(4469146,'Greensboro','NC','US',36.07264,-79.79198,285342),
(4469160,'Greenville','NC','US',35.61266,-77.36635,90597),
(4470244,'Havelock','NC','US',34.87905,-76.90133,20364),
(4470778,'Hickory','NC','US',35.73319,-81.3412,40374),
(4471025,'High Point','NC','US',35.95569,-80.00532,110268),
(4471641,'Holly Springs','NC','US',35.65127,-78.83362,31377),
(4472370,'Huntersville','NC','US',35.41069,-80.84285,52704),
(4472687,'Indian Trail','NC','US',35.07681,-80.66924,37073),
(4473083,'Jacksonville','NC','US',34.75405,-77.43024,67357),
(4474040,'Kannapolis','NC','US',35.48736,-80.62173,46144),
(4474221,'Kernersville','NC','US',36.11986,-80.07365,23811),
(4474436,'Kinston','NC','US',35.26266,-77.58164,21337),
(4477525,'Lumberton','NC','US',34.61834,-79.01045,21667),
(4478334,'Matthews','NC','US',35.11681,-80.72368,30678),
(4479759,'Mint Hill','NC','US',35.17959,-80.64729,25627),
(4479946,'Monroe','NC','US',34.98543,-80.54951,34623),
(4480125,'Mooresville','NC','US',35.58486,-80.81007,36009),
(4480285,'Morrisville','NC','US',35.82348,-78.82556,23820),
(4481682,'New Bern','NC','US',35.10849,-77.04411,30070),
(4487042,'Raleigh','NC','US',35.7721,-78.63861,451066),
(4488762,'Rocky Mount','NC','US',35.93821,-77.79053,55806),
(4489985,'Salisbury','NC','US',35.67097,-80.47423,34017),
(4490329,'Sanford','NC','US',35.47988,-79.1803,29144),
(4491180,'Shelby','NC','US',35.29235,-81.53565,20189),
(4493316,'Statesville','NC','US',35.78264,-80.8873,26221),
(4494942,'Thomasville','NC','US',35.88264,-80.08199,27061),
(4497290,'Wake Forest','NC','US',35.97987,-78.50972,38199),
(4498303,'West Raleigh','NC','US',35.78682,-78.66389,338759),
(4499379,'Wilmington','NC','US',34.22573,-77.94471,115933),
(4499389,'Wilson','NC','US',35.72127,-77.91554,49643),
(4499612,'Winston-Salem','NC','US',36.09986,-80.24422,241218),
(4500546,'Atlantic City','NJ','US',39.36415,-74.42306,39260),
(4500688,'Bayville','NJ','US',39.90929,-74.15486,20512),
(4500942,'Bridgeton','NJ','US',39.42734,-75.23408,25031),
(4501018,'Camden','NJ','US',39.92595,-75.11962,76119),
(4501198,'Cherry Hill','NJ','US',39.93484,-75.03073,70475),
(4502434,'Jackson','NJ','US',39.7765,-74.86238,54856),
(4503078,'Millville','NJ','US',39.40206,-75.03934,28230),
(4503136,'Mount Laurel','NJ','US',39.934,-74.891,41864),
(4503548,'Pennsauken','NJ','US',39.95622,-75.05795,36332),
(4503646,'Pleasantville','NJ','US',39.38984,-74.52404,20755),
(4504118,'Sicklerville','NJ','US',39.71734,-74.96933,42891),
(4504225,'South Vineland','NJ','US',39.44595,-75.02879,58122),
(4504476,'Toms River','NJ','US',39.95373,-74.19792,88791),
(4504618,'Vincentown','NJ','US',39.934,-74.74849,24664),
(4504621,'Vineland','NJ','US',39.48623,-75.02573,60818),
(4505542,'Athens','OH','US',39.32924,-82.10126,25044),
(4506008,'Beavercreek','OH','US',39.70923,-84.06327,46277),
(4508204,'Centerville','OH','US',39.62839,-84.15938,23882),
(4508722,'Cincinnati','OH','US',39.12711,-84.51439,296943),
(4509177,'Columbus','OH','US',39.96118,-82.99879,850106),
(4509884,'Dayton','OH','US',39.75895,-84.19161,140599),
(4511263,'Fairborn','OH','US',39.82089,-84.01938,33452),
(4511283,'Fairfield','OH','US',39.34589,-84.5605,42767),
(4513409,'Grove City','OH','US',39.88145,-83.09296,39388),
(4513575,'Hamilton','OH','US',39.3995,-84.56134,62407),
(4514746,'Huber Heights','OH','US',39.84395,-84.12466,38176),
(4515843,'Kettering','OH','US',39.6895,-84.16883,55525),
(4516233,'Lancaster','OH','US',39.71368,-82.59933,39766),
(4516412,'Lebanon','OH','US',39.43534,-84.20299,20623),
(4517698,'Mason','OH','US',39.36006,-84.30994,32662),
(4518188,'Miamisburg','OH','US',39.64284,-84.28661,20034),
(4518264,'Middletown','OH','US',39.51506,-84.39828,48760),
(4520760,'Oxford','OH','US',39.507,-84.74523,22104),
(4521816,'Portsmouth','OH','US',38.73174,-82.99767,20409),
(4522411,'Reynoldsburg','OH','US',39.95479,-82.81212,37158),
(4522586,'Riverside','OH','US',39.77978,-84.1241,24972),
(4525353,'Springfield','OH','US',39.92423,-83.80882,59680),
(4526576,'Trotwood','OH','US',39.79728,-84.31133,24096),
(4526993,'Upper Arlington','OH','US',39.99451,-83.06241,34907),
(4528810,'Xenia','OH','US',39.68478,-83.92965,25976),
(4528923,'Zanesville','OH','US',39.94035,-82.01319,25498),
(4529469,'Ardmore','OK','US',34.17426,-97.14363,25176),
(4529987,'Bartlesville','OK','US',36.74731,-95.98082,36595),
(4530801,'Bixby','OK','US',35.94204,-95.88332,24657),
(4531405,'Broken Arrow','OK','US',36.0526,-95.79082,106563),
(4534934,'Del City','OK','US',35.44201,-97.44087,22022),
(4535389,'Duncan','OK','US',34.5023,-97.95781,23231),
(4535740,'Edmond','OK','US',35.65283,-97.4781,90092),
(4535961,'Enid','OK','US',36.39559,-97.87839,51776),
(4539615,'Jenks','OK','US',36.02287,-95.96833,20740),
(4540737,'Lawton','OK','US',34.60869,-98.39033,96655),
(4542765,'Midwest City','OK','US',35.44951,-97.3967,57249),
(4542975,'Moore','OK','US',35.33951,-97.4867,60451)
on conflict (id) do nothing;
insert into places (id, name, state, country, lat, lng, population) values
(4543338,'Muskogee','OK','US',35.74788,-95.36969,38456),
(4543352,'Mustang','OK','US',35.38423,-97.72449,20226),
(4543762,'Norman','OK','US',35.22257,-97.43948,120284),
(4544349,'Oklahoma City','OK','US',35.46756,-97.51643,631346),
(4547407,'Owasso','OK','US',36.26954,-95.85471,34542),
(4548267,'Ponca City','OK','US',36.70698,-97.08559,24758),
(4550881,'Sapulpa','OK','US',35.9987,-96.11417,20579),
(4551177,'Shawnee','OK','US',35.32729,-96.9253,31286),
(4552215,'Stillwater','OK','US',36.11561,-97.05837,48967),
(4553433,'Tulsa','OK','US',36.15398,-95.99277,403505),
(4556165,'Yukon','OK','US',35.50672,-97.76254,25892),
(4557109,'Chambersburg','PA','US',39.93759,-77.6611,20691),
(4557137,'Chester','PA','US',39.84967,-75.35707,34092),
(4557606,'Drexel Hill','PA','US',39.94706,-75.29213,28043),
(4560303,'Pennsport','PA','US',39.92761,-75.15045,26000),
(4560349,'Philadelphia','PA','US',39.95233,-75.16379,1567442),
(4561407,'Springfield','PA','US',39.93067,-75.32019,23363),
(4562193,'Wharton','PA','US',39.92678,-75.15712,49732),
(4562237,'Whitman','PA','US',39.91678,-75.15546,49732),
(4562407,'York','PA','US',39.9626,-76.72774,43992),
(4569067,'Aiken','SC','US',33.56042,-81.71955,30604),
(4569298,'Anderson','SC','US',34.50344,-82.65013,27335),
(4574324,'Charleston','SC','US',32.77657,-79.93092,132609),
(4575352,'Columbia','SC','US',34.00071,-81.03481,133803),
(4575461,'Conway','SC','US',33.836,-79.04781,21053),
(4577263,'Easley','SC','US',34.82984,-82.60152,20765),
(4578737,'Florence','SC','US',34.19543,-79.76256,38228),
(4580098,'Goose Creek','SC','US',32.98101,-80.03259,40633),
(4580543,'Greenville','SC','US',34.85262,-82.39401,64579),
(4580569,'Greenwood','SC','US',34.1954,-82.16179,23260),
(4580599,'Greer','SC','US',34.93873,-82.22706,28365),
(4581832,'Hilton Head Island','SC','US',32.19382,-80.73816,40512),
(4581833,'Hilton Head','SC','US',32.21632,-80.75261,37099),
(4585000,'Lexington','SC','US',33.98154,-81.23621,20138),
(4586523,'Mauldin','SC','US',34.77873,-82.31012,25135),
(4588165,'Mount Pleasant','SC','US',32.79407,-79.86259,81317),
(4588718,'Myrtle Beach','SC','US',33.68906,-78.88669,31035),
(4589368,'North Augusta','SC','US',33.5018,-81.96512,22522),
(4589387,'North Charleston','SC','US',32.85462,-79.97481,108304),
(4593142,'Rock Hill','SC','US',34.92487,-81.02508,71548),
(4593724,'Saint Andrews','SC','US',34.04543,-81.12926,21151),
(4595864,'Simpsonville','SC','US',34.73706,-82.25428,20736),
(4597200,'Spartanburg','SC','US',34.94957,-81.93205,37867),
(4597919,'Summerville','SC','US',33.0185,-80.17565,48848),
(4597948,'Sumter','SC','US',33.92044,-80.34147,40816),
(4598353,'Taylors','SC','US',34.92039,-82.29623,21617),
(4599937,'Wade Hampton','SC','US',34.90373,-82.33317,20622),
(4604183,'Bartlett','TN','US',35.20453,-89.87398,58579),
(4608408,'Brentwood','TN','US',36.03312,-86.78278,41763),
(4608418,'Brentwood Estates','TN','US',36.02506,-86.77917,31279),
(4608657,'Bristol','TN','US',36.59511,-82.18874,26666),
(4612862,'Chattanooga','TN','US',35.04563,-85.30968,176588),
(4613868,'Clarksville','TN','US',36.52977,-87.35945,149176),
(4614088,'Cleveland','TN','US',35.15952,-84.87661,43898),
(4614748,'Collierville','TN','US',35.04204,-89.66453,48863),
(4614867,'Columbia','TN','US',35.61507,-87.03528,36800),
(4615145,'Cookeville','TN','US',36.16284,-85.50164,32113),
(4619947,'East Chattanooga','TN','US',35.06535,-85.24912,154024),
(4620131,'East Ridge','TN','US',35.01424,-85.2519,20979),
(4621846,'Farragut','TN','US',35.88452,-84.15353,21919),
(4623560,'Franklin','TN','US',35.92506,-86.86889,72639),
(4624180,'Gallatin','TN','US',36.38838,-86.44666,34334),
(4624601,'Germantown','TN','US',35.08676,-89.81009,39240),
(4628735,'Hendersonville','TN','US',36.30477,-86.62,56018),
(4632595,'Jackson','TN','US',35.61452,-88.81395,66975),
(4633419,'Johnson City','TN','US',36.31344,-82.35347,66027),
(4634662,'Kingsport','TN','US',36.54843,-82.56182,53014),
(4634946,'Knoxville','TN','US',35.96064,-83.92074,185291),
(4635031,'La Vergne','TN','US',36.01562,-86.58194,34794),
(4636045,'Lebanon','TN','US',36.20811,-86.2911,30262),
(4639848,'Maryville','TN','US',35.75647,-83.97046,28464),
(4641239,'Memphis','TN','US',35.14953,-90.04898,655770),
(4642938,'Morristown','TN','US',36.21398,-83.29489,29478),
(4643336,'Mount Juliet','TN','US',36.20005,-86.51861,31540),
(4644312,'Murfreesboro','TN','US',35.84562,-86.39027,126118),
(4644585,'Nashville','TN','US',36.16589,-86.78444,530852),
(4645421,'New South Memphis','TN','US',35.08676,-90.05676,641608),
(4646571,'Oak Ridge','TN','US',36.01036,-84.26964,29302),
(4657077,'Shelbyville','TN','US',35.48341,-86.46027,21317),
(4658590,'Smyrna','TN','US',35.98284,-86.5186,46607),
(4659446,'Spring Hill','TN','US',35.75118,-86.93,36055),
(4669635,'Abilene','TX','US',32.44874,-99.73314,121721),
(4670249,'Alief','TX','US',29.71106,-95.59633,98725),
(4670300,'Allen','TX','US',33.10317,-96.67055,98143),
(4670592,'Alvin','TX','US',29.42385,-95.2441,25791),
(4671240,'Arlington','TX','US',32.73569,-97.10807,388125),
(4671524,'Atascocita','TX','US',29.99883,-95.1766,65844),
(4671654,'Austin','TX','US',30.26715,-97.74306,931830),
(4672059,'Balch Springs','TX','US',32.72874,-96.62277,25210),
(4672731,'Baytown','TX','US',29.7355,-94.97743,76335),
(4672989,'Beaumont','TX','US',30.08605,-94.10185,118129),
(4673094,'Bedford','TX','US',32.84402,-97.14307,49337),
(4673425,'Belton','TX','US',31.05601,-97.46445,20547),
(4673482,'Benbrook','TX','US',32.67319,-97.46058,22629),
(4676740,'Brownsville','TX','US',25.90175,-97.49748,183887),
(4676920,'Brushy Creek','TX','US',30.51353,-97.73973,21764),
(4677008,'Bryan','TX','US',30.67436,-96.36996,82118),
(4677551,'Burleson','TX','US',32.54208,-97.32085,43625),
(4678901,'Canyon Lake','TX','US',29.87522,-98.26251,21262),
(4679195,'Carrollton','TX','US',32.95373,-96.89028,133168),
(4679803,'Cedar Hill','TX','US',32.58847,-96.95612,48507),
(4679867,'Cedar Park','TX','US',30.5052,-97.82029,65945),
(4680388,'Channelview','TX','US',29.77606,-95.11465,38289),
(4681462,'Cibolo','TX','US',29.56162,-98.22696,26637),
(4681976,'Cleburne','TX','US',32.34764,-97.38668,30020),
(4682127,'Cloverleaf','TX','US',29.77828,-95.17188,22942),
(4682464,'College Station','TX','US',30.62798,-96.33441,107889),
(4682478,'Colleyville','TX','US',32.88096,-97.15501,25487),
(4682991,'Conroe','TX','US',30.31188,-95.45605,68602),
(4683021,'Converse','TX','US',29.51801,-98.31612,21987),
(4683217,'Coppell','TX','US',32.95457,-97.01501,41159),
(4683244,'Copperas Cove','TX','US',31.12406,-97.90308,33081),
(4683317,'Corinth','TX','US',33.15401,-97.06473,20998),
(4683416,'Corpus Christi','TX','US',27.80058,-97.39638,324074),
(4683462,'Corsicana','TX','US',32.09543,-96.46887,23952),
(4684724,'Cypress','TX','US',29.96911,-95.69717,46025),
(4684888,'Dallas','TX','US',32.78306,-96.80667,1300092),
(4685524,'DeSoto','TX','US',32.58986,-96.85695,52486),
(4685737,'Deer Park','TX','US',29.70523,-95.12382,33806),
(4685892,'Denison','TX','US',33.75566,-96.53666,23150),
(4685907,'Denton','TX','US',33.21484,-97.13307,131044),
(4687331,'Duncanville','TX','US',32.6518,-96.90834,39826),
(4688275,'Edinburg','TX','US',26.30174,-98.16334,84497),
(4689550,'Euless','TX','US',32.83707,-97.08195,54219),
(4690198,'Farmers Branch','TX','US',32.92651,-96.89612,32689),
(4691585,'Flower Mound','TX','US',33.01457,-97.09696,71253),
(4691930,'Fort Worth','TX','US',32.72541,-97.32085,833319),
(4692521,'Friendswood','TX','US',29.5294,-95.20104,38800),
(4692559,'Frisco','TX','US',33.15067,-96.82361,154407),
(4692883,'Galveston','TX','US',29.30135,-94.7977,50180),
(4693003,'Garland','TX','US',32.91262,-96.63888,236897),
(4693342,'Georgetown','TX','US',30.63269,-97.67723,63716),
(4694482,'Grand Prairie','TX','US',32.74596,-96.99778,187809),
(4694568,'Grapevine','TX','US',32.93429,-97.07807,51404),
(4695066,'Greenville','TX','US',33.13845,-96.11081,26515),
(4695912,'Haltom City','TX','US',32.79957,-97.26918,44206),
(4696202,'Harker Heights','TX','US',31.08351,-97.65974,29142),
(4696233,'Harlingen','TX','US',26.19063,-97.6961,65774),
(4699066,'Houston','TX','US',29.76328,-95.36327,2296224),
(4699540,'Huntsville','TX','US',30.72353,-95.55078,40938),
(4699575,'Hurst','TX','US',32.82346,-97.17057,39016),
(4699626,'Hutto','TX','US',30.5427,-97.54667,22722),
(4700168,'Irving','TX','US',32.81402,-96.94889,236607),
(4702828,'Keller','TX','US',32.93457,-97.25168,45758),
(4703078,'Kerrville','TX','US',30.04743,-99.14032,23136),
(4703223,'Killeen','TX','US',31.11712,-97.7278,140806),
(4703384,'Kingsville','TX','US',27.51587,-97.85611,26225),
(4703811,'Kyle','TX','US',29.98911,-97.87723,35733),
(4704108,'La Porte','TX','US',29.66578,-95.01937,35148),
(4704628,'Lake Jackson','TX','US',29.03386,-95.43439,27533),
(4705191,'Lancaster','TX','US',32.59208,-96.75611,38801),
(4705349,'Laredo','TX','US',27.50641,-99.50754,255473),
(4705692,'League City','TX','US',29.50745,-95.09493,98312),
(4705708,'Leander','TX','US',30.57881,-97.85307,37889),
(4706057,'Lewisville','TX','US',33.04623,-96.99417,104039),
(4706736,'Little Elm','TX','US',33.16262,-96.93751,38341),
(4707814,'Longview','TX','US',32.5007,-94.74049,82287),
(4708308,'Lufkin','TX','US',31.33824,-94.7291,36333),
(4709013,'Mansfield','TX','US',32.56319,-97.14168,64274),
(4709272,'Marshall','TX','US',32.54487,-94.36742,23820),
(4709796,'McAllen','TX','US',26.20341,-98.23001,140269),
(4710178,'McKinney','TX','US',33.19762,-96.61527,162898),
(4710826,'Mesquite','TX','US',32.7668,-96.59916,144788),
(4711156,'Midlothian','TX','US',32.48236,-96.99445,22318),
(4711725,'Mission','TX','US',26.21591,-98.32529,83298),
(4711729,'Mission Bend','TX','US',29.69384,-95.66495,36501),
(4711801,'Missouri City','TX','US',29.61857,-95.53772,74139),
(4713507,'Murphy','TX','US',33.01512,-96.61305,20610),
(4713735,'Nacogdoches','TX','US',31.60351,-94.65549,33894),
(4714131,'New Braunfels','TX','US',29.703,-98.12445,70543),
(4715292,'North Richland Hills','TX','US',32.8343,-97.2289,69204),
(4717560,'Paris','TX','US',33.66094,-95.55551,24782),
(4717782,'Pasadena','TX','US',29.69106,-95.2091,153784),
(4718097,'Pearland','TX','US',29.56357,-95.28605,108821),
(4718711,'Pflugerville','TX','US',30.43937,-97.62,57122),
(4718721,'Pharr','TX','US',26.1948,-98.18362,76538),
(4719457,'Plano','TX','US',33.01984,-96.69889,283558),
(4720039,'Port Arthur','TX','US',29.88519,-93.94233,55340),
(4722625,'Richardson','TX','US',32.94818,-96.72972,110815),
(4723406,'Rockwall','TX','US',32.93123,-96.45971,42566),
(4723914,'Rosenberg','TX','US',29.55718,-95.80856,35510),
(4724129,'Round Rock','TX','US',30.50826,-97.6789,115997),
(4724194,'Rowlett','TX','US',32.9029,-96.56388,60236),
(4724564,'Sachse','TX','US',32.97623,-96.59527,24554),
(4724642,'Saginaw','TX','US',32.86013,-97.36391,22079),
(4726206,'San Antonio','TX','US',29.42412,-98.49363,1469845),
(4726290,'San Benito','TX','US',26.13258,-97.6311,24496),
(4726440,'San Juan','TX','US',26.18924,-98.15529,36556),
(4726491,'San Marcos','TX','US',29.88327,-97.94139,60684),
(4727326,'Schertz','TX','US',29.55217,-98.26973,37938),
(4727756,'Seguin','TX','US',29.56884,-97.96473,27864),
(4728328,'Sherman','TX','US',33.63566,-96.60888,40667),
(4733313,'Southlake','TX','US',32.94124,-97.13418,29941),
(4733624,'Spring','TX','US',30.07994,-95.41716,54298),
(4734350,'Stephenville','TX','US',32.2207,-98.20226,20120),
(4734825,'Sugar Land','TX','US',29.61968,-95.63495,88156),
(4735966,'Temple','TX','US',31.09823,-97.34278,72277),
(4736096,'Texarkana','TX','US',33.42513,-94.04769,37280),
(4736134,'Texas City','TX','US',29.38385,-94.9027,47618),
(4736388,'The Colony','TX','US',33.08901,-96.88639,41779),
(4736476,'The Woodlands','TX','US',30.15799,-95.48938,93847),
(4738214,'Tyler','TX','US',32.35126,-95.30106,103700),
(4738606,'University Park','TX','US',32.85013,-96.80028,24759),
(4739157,'Victoria','TX','US',28.80527,-97.0036,67574),
(4739526,'Waco','TX','US',31.54933,-97.14667,132356),
(4740214,'Watauga','TX','US',32.85791,-97.25474,24525),
(4740328,'Waxahachie','TX','US',32.38653,-96.84833,33384),
(4740364,'Weatherford','TX','US',32.7593,-97.79725,28742),
(4740629,'Weslaco','TX','US',26.15952,-97.99084,39474),
(4741752,'Wichita Falls','TX','US',33.91371,-98.49339,104710),
(4743275,'Wylie','TX','US',33.01512,-96.53888,46708),
(4744091,'Alexandria','VA','US',38.80484,-77.04692,153511),
(4744468,'Annandale','VA','US',38.83039,-77.19637,41008),
(4744709,'Arlington','VA','US',38.88101,-77.10428,207627),
(4744870,'Ashburn','VA','US',39.04372,-77.48749,43511),
(4745272,'Baileys Crossroads','VA','US',38.85039,-77.1297,23643),
(4747845,'Blacksburg','VA','US',37.22957,-80.41394,44215),
(4749950,'Burke','VA','US',38.79345,-77.27165,41055),
(4751421,'Cave Spring','VA','US',37.22764,-80.01282,24922),
(4751839,'Centreville','VA','US',38.84039,-77.42888,71135),
(4751935,'Chantilly','VA','US',38.89428,-77.4311,23039),
(4752031,'Charlottesville','VA','US',38.02931,-78.47668,46597),
(4752186,'Chesapeake','VA','US',36.81904,-76.27494,235429),
(4752229,'Chester','VA','US',37.35682,-77.44165,20987),
(4752665,'Christiansburg','VA','US',37.12985,-80.40894,21943),
(4755158,'Dale City','VA','US',38.63706,-77.31109,65969),
(4755280,'Danville','VA','US',36.58597,-79.39502,42082),
(4756955,'East Hampton','VA','US',37.03737,-76.33161,147993),
(4758023,'Fairfax','VA','US',38.84622,-77.30637,24013),
(4760059,'Fredericksburg','VA','US',38.30318,-77.46054,28118),
(4762894,'Hampton','VA','US',37.02987,-76.34522,136454),
(4763231,'Harrisonburg','VA','US',38.44957,-78.86892,52538),
(4763793,'Herndon','VA','US',38.96955,-77.3861,24568),
(4764826,'Hopewell','VA','US',37.30432,-77.2872,22378),
(4768351,'Lake Ridge','VA','US',38.68789,-77.29776,41058),
(4769125,'Leesburg','VA','US',39.11566,-77.5636,51209),
(4769608,'Lincolnia','VA','US',38.81845,-77.14331,22855),
(4769667,'Linton Hall','VA','US',38.75984,-77.57499,35725),
(4771075,'Lynchburg','VA','US',37.41375,-79.14225,79812),
(4771401,'Manassas','VA','US',38.75095,-77.47527,41764),
(4772354,'McLean','VA','US',38.93428,-77.17748,48115),
(4772566,'Mechanicsville','VA','US',37.60876,-77.37331,36348),
(4776024,'Newport News','VA','US',37.08339,-76.46965,182385),
(4776222,'Norfolk','VA','US',36.84681,-76.28522,246393),
(4776970,'Oakton','VA','US',38.88095,-77.30082,34166),
(4778626,'Petersburg','VA','US',37.22793,-77.40193,32477),
(4779999,'Portsmouth','VA','US',36.83543,-76.29827,96201),
(4780011,'Portsmouth Heights','VA','US',36.82098,-76.36883,99049),
(4781530,'Reston','VA','US',38.96872,-77.3411,58404),
(4781708,'Richmond','VA','US',37.55376,-77.46026,220289),
(4782167,'Roanoke','VA','US',37.27097,-79.94143,99897),
(4782864,'Rose Hill','VA','US',38.78872,-77.11276,20226),
(4784112,'Salem','VA','US',37.29347,-80.05476,25432),
(4785576,'Short Pump','VA','US',37.65042,-77.61249,24729),
(4786667,'South Riding','VA','US',38.92094,-77.50388,24256),
(4786714,'South Suffolk','VA','US',36.71709,-76.59023,80690),
(4787117,'Springfield','VA','US',38.78928,-77.1872,30484),
(4787440,'Staunton','VA','US',38.14991,-79.0732,24416),
(4787534,'Sterling','VA','US',39.00622,-77.4286,27822),
(4788158,'Suffolk','VA','US',36.72836,-76.58496,88161),
(4790207,'Tuckahoe','VA','US',37.59015,-77.55638,44990),
(4791259,'Virginia Beach','VA','US',36.85293,-75.97799,452745),
(4792522,'Waynesboro','VA','US',38.06847,-78.88947,21491),
(4792867,'West Lynchburg','VA','US',37.4032,-79.17808,65517),
(4792901,'West Springfield','VA','US',38.77261,-77.22109,22460),
(4794120,'Winchester','VA','US',39.18566,-78.16333,27284),
(4794531,'Woodlawn','VA','US',38.71678,-77.13276,20804),
(4801859,'Charleston','WV','US',38.34982,-81.63262,49736),
(4809537,'Huntington','WV','US',38.41925,-82.44515,48638),
(4815352,'Morgantown','WV','US',39.62953,-79.9559,30708),
(4817641,'Parkersburg','WV','US',39.26674,-81.56151,30991),
(4828193,'Sherwood','AR','US',34.81509,-92.22432,30517),
(4828382,'Franklin','IN','US',39.48061,-86.05499,24598),
(4828890,'Chillicothe','OH','US',39.33312,-82.9824,21727),
(4829762,'Alabaster','AL','US',33.24428,-86.81638,32707),
(4829791,'Albertville','AL','US',34.26783,-86.20878,21462),
(4830198,'Anniston','AL','US',33.65983,-85.83163,22347),
(4830668,'Athens','AL','US',34.80243,-86.97219,24966),
(4830796,'Auburn','AL','US',32.60986,-85.48078,62059),
(4832038,'Glendale Heights','IL','US',41.9146,-88.06486,34208),
(4832272,'North Andover','MA','US',42.6987,-71.13506,28222),
(4832294,'Revere','MA','US',42.40843,-71.01199,53422),
(4832353,'Danbury','CT','US',41.39482,-73.45401,84657),
(4832425,'Darien','CT','US',41.07871,-73.46929,20732),
(4832554,'Inkster','MI','US',42.2942,-83.30993,24672),
(4833320,'Cleveland Heights','OH','US',41.52005,-81.55624,44962),
(4833403,'East Hartford','CT','US',41.78232,-72.61203,51252),
(4833425,'East Haven','CT','US',41.27621,-72.86843,29257),
(4833505,'East Norwalk','CT','US',41.10565,-73.39845,84530),
(4834040,'Enfield','CT','US',41.97621,-72.59176,45212),
(4834157,'Fairfield','CT','US',41.14121,-73.26373,59052),
(4834272,'Farmington','CT','US',41.71982,-72.83204,25000),
(4835003,'Glastonbury','CT','US',41.71232,-72.60815,31876),
(4835512,'Guilford','CT','US',41.28899,-72.68176,22498),
(4835654,'Hamden','CT','US',41.39593,-72.89677,59847),
(4835797,'Hartford','CT','US',41.76371,-72.68509,124006),
(4838174,'Manchester','CT','US',41.77593,-72.52148,30577),
(4838204,'Mansfield City','CT','US',41.76593,-72.23369,26439),
(4838524,'Meriden','CT','US',41.53815,-72.80704,59988),
(4838633,'Middletown','CT','US',41.56232,-72.65065,46756),
(4838652,'Milford','CT','US',41.22232,-73.0565,52759),
(4838887,'Montville Center','CT','US',41.47899,-72.15119,20180),
(4839222,'Naugatuck','CT','US',41.48593,-73.05066,31538),
(4839292,'New Britain','CT','US',41.66121,-72.77954,72808),
(4839366,'New Haven','CT','US',41.30815,-72.92816,130322),
(4839416,'New London','CT','US',41.35565,-72.09952,27179),
(4839497,'Newington','CT','US',41.69788,-72.72371,30562),
(4839704,'North Haven','CT','US',41.39093,-72.85954,24093),
(4839745,'North Stamford','CT','US',41.13815,-73.54346,121230),
(4839822,'Norwalk','CT','US',41.1176,-73.4079,88485),
(4839843,'Norwich','CT','US',41.52426,-72.07591,39899),
(4842898,'Shelton','CT','US',41.31649,-73.09316,41296),
(4843353,'South Windsor','CT','US',41.82371,-72.6212,24412),
(4843564,'Stamford','CT','US',41.05343,-73.53873,128874),
(4843811,'Stratford','CT','US',41.18454,-73.13317,51384),
(4844309,'Torrington','CT','US',41.80065,-73.12122,34906),
(4844459,'Trumbull','CT','US',41.24287,-73.20067,36018),
(4845193,'Waterbury','CT','US',41.55815,-73.0515,108802),
(4845411,'West Hartford','CT','US',41.76204,-72.74204,63268),
(4845419,'West Haven','CT','US',41.27065,-72.94705,54927),
(4845519,'West Torrington','CT','US',41.81843,-73.14372,36000),
(4845585,'Westport','CT','US',41.14149,-73.3579,26391),
(4845612,'Wethersfield','CT','US',41.71427,-72.65259,26668),
(4845898,'Windham','CT','US',41.69982,-72.15702,23072),
(4845920,'Windsor','CT','US',41.8526,-72.6437,28778),
(4846834,'Ames','IA','US',42.03471,-93.61994,65060),
(4846960,'Ankeny','IA','US',41.72971,-93.60577,56764),
(4848489,'Bettendorf','IA','US',41.52448,-90.51569,35505),
(4849826,'Burlington','IA','US',40.80754,-91.11292,25410),
(4850699,'Cedar Falls','IA','US',42.52776,-92.44547,41255),
(4850751,'Cedar Rapids','IA','US',42.00833,-91.64407,130405),
(4852022,'Clinton','IA','US',41.84447,-90.18874,26064),
(4852640,'Coralville','IA','US',41.6764,-91.58045,20608),
(4852832,'Council Bluffs','IA','US',41.26194,-95.86083,62597),
(4853423,'Davenport','IA','US',41.52364,-90.57764,102582),
(4853828,'Des Moines','IA','US',41.60054,-93.60911,210330),
(4854529,'Dubuque','IA','US',42.50056,-90.66457,58799),
(4857486,'Fort Dodge','IA','US',42.49747,-94.16802,24649),
(4862034,'Iowa City','IA','US',41.66113,-91.53017,74220),
(4862760,'Johnston','IA','US',41.67304,-93.69772,20871),
(4866263,'Marion','IA','US',42.03417,-91.59768,37330),
(4866371,'Marshalltown','IA','US',42.04943,-92.90798,27620),
(4866445,'Mason City','IA','US',43.15357,-93.20104,27366),
(4868404,'Muscatine','IA','US',41.42447,-91.04321,23968),
(4870380,'Ottumwa','IA','US',41.02001,-92.4113,24624),
(4876523,'Sioux City','IA','US',42.49999,-96.40031,82821),
(4879890,'Urbandale','IA','US',41.62666,-93.71217,44062),
(4880889,'Waterloo','IA','US',42.49276,-92.34296,68460),
(4881346,'West Des Moines','IA','US',41.57721,-93.71133,64113),
(4882920,'Addison','IL','US',41.9317,-87.98896,37208),
(4883012,'Albany Park','IL','US',41.96836,-87.72339,52079),
(4883078,'Algonquin','IL','US',42.16558,-88.29425,30571),
(4883555,'Arlington Heights','IL','US',42.08836,-87.98063,75926),
(4883679,'Ashburn','IL','US',41.74753,-87.71116,42752),
(4883817,'Aurora','IL','US',41.76058,-88.32007,200661),
(4883904,'Avondale','IL','US',41.93892,-87.71117,39721),
(4884141,'Bartlett','IL','US',41.99503,-88.18563,41545),
(4884192,'Batavia','IL','US',41.85003,-88.31257,26495),
(4884442,'Belmont Cragin','IL','US',41.9317,-87.76867,79159),
(4884453,'Belvidere','IL','US',42.26391,-88.84427,25132),
(4884597,'Berwyn','IL','US',41.85059,-87.79367,56368),
(4885156,'Bloomingdale','IL','US',41.95753,-88.0809,22254),
(4885164,'Bloomington','IL','US',40.4842,-88.99369,78292),
(4885186,'Blue Island','IL','US',41.65726,-87.68005,23652),
(4885265,'Bolingbrook','IL','US',41.69864,-88.0684,74306),
(4885565,'Bridgeport','IL','US',41.83809,-87.65116,33878),
(4885597,'Brighton Park','IL','US',41.81892,-87.69894,44202),
(4885955,'Buffalo Grove','IL','US',42.15141,-87.95979,41496),
(4885983,'Burbank','IL','US',41.73392,-87.7795,29128),
(4886255,'Calumet City','IL','US',41.61559,-87.52949,37031),
(4886662,'Carol Stream','IL','US',41.91253,-88.13479,40356),
(4886676,'Carpentersville','IL','US',42.12114,-88.25786,38512),
(4887158,'Champaign','IL','US',40.11642,-88.24338,86096),
(4887284,'Chatham','IL','US',41.74115,-87.61255,31392),
(4887398,'Chicago','IL','US',41.85003,-87.65005,2720546),
(4887442,'Chicago Heights','IL','US',41.50615,-87.6356,30284),
(4887463,'Chicago Lawn','IL','US',41.77503,-87.69644,55551),
(4888015,'Cicero','IL','US',41.84559,-87.75394,83886),
(4889107,'Crest Hill','IL','US',41.55475,-88.09867,21153),
(4889229,'Crystal Lake','IL','US',42.24113,-88.3162,40448),
(4889426,'Danville','IL','US',40.12448,-87.63002,32108),
(4889447,'Darien','IL','US',41.75198,-87.97395,22256),
(4889553,'DeKalb','IL','US',41.92947,-88.75036,43211),
(4889772,'Des Plaines','IL','US',42.03336,-87.8834,58677),
(4890009,'Dolton','IL','US',41.63892,-87.60727,23197),
(4890075,'Douglas','IL','US',41.83476,-87.61811,20323),
(4890119,'Downers Grove','IL','US',41.80892,-88.01117,49732),
(4890507,'East Garfield Park','IL','US',41.88087,-87.70283,20656),
(4890536,'East Moline','IL','US',41.50087,-90.4443,21350),
(4890549,'East Peoria','IL','US',40.66615,-89.5801,23080),
(4890701,'Edgewater','IL','US',41.98337,-87.66395,54873),
(4890864,'Elgin','IL','US',42.03725,-88.28119,112111),
(4890925,'Elk Grove Village','IL','US',42.00392,-87.97035,33238),
(4891010,'Elmhurst','IL','US',41.89947,-87.94034,45957),
(4891051,'Elmwood Park','IL','US',41.92114,-87.80923,24840),
(4891176,'Englewood','IL','US',41.77976,-87.64588,26121),
(4891382,'Evanston','IL','US',42.04114,-87.69006,75527),
(4893171,'Freeport','IL','US',42.29669,-89.62123,24476),
(4893365,'Gage Park','IL','US',41.79503,-87.69616,41202),
(4893392,'Galesburg','IL','US',40.94782,-90.37124,31273),
(4893591,'Geneva','IL','US',41.88753,-88.30535,21806),
(4893811,'Glen Ellyn','IL','US',41.87753,-88.06701,28201),
(4893886,'Glenview','IL','US',42.06975,-87.78784,47446),
(4894320,'Grand Boulevard','IL','US',41.81392,-87.61727,22373),
(4894465,'Grayslake','IL','US',42.34447,-88.04175,20915),
(4894861,'Gurnee','IL','US',42.3703,-87.90202,31056),
(4895066,'Hanover Park','IL','US',41.99947,-88.14507,38333),
(4895298,'Harvey','IL','US',41.61003,-87.64671,25194),
(4895876,'Highland Park','IL','US',42.18169,-87.80034,29743),
(4896075,'Hoffman Estates','IL','US',42.04281,-88.0798,52138),
(4896336,'Homer Glen','IL','US',41.60003,-87.93811,24395),
(4896691,'Huntley','IL','US',42.16808,-88.42814,26005),
(4896728,'Hyde Park','IL','US',41.7942,-87.59394,26893),
(4897543,'Irving Park','IL','US',41.95336,-87.73645,56520),
(4898015,'Joliet','IL','US',41.52519,-88.0834,147861),
(4898182,'Kankakee','IL','US',41.12003,-87.86115,26676),
(4899184,'Lake in the Hills','IL','US',42.18169,-88.33036,29024),
(4899340,'Lansing','IL','US',41.56476,-87.53893,28349),
(4899739,'Libertyville','IL','US',42.28308,-87.95313,20436),
(4899911,'Lincoln Park','IL','US',41.9217,-87.64783,66959),
(4899966,'Lincoln Square','IL','US',41.97587,-87.68922,40761),
(4900080,'Lisle','IL','US',41.80114,-88.07479,22964),
(4900292,'Lockport','IL','US',41.58948,-88.05784,25175),
(4900358,'Logan Square','IL','US',41.92337,-87.69922,73702),
(4900373,'Lombard','IL','US',41.88003,-88.00784,43797),
(4900579,'Loves Park','IL','US',42.32002,-89.05816,23455),
(4900611,'Lower West Side','IL','US',41.8542,-87.66561,34410),
(4900801,'Machesney Park','IL','US',42.34724,-89.039,22927),
(4901514,'Maywood','IL','US',41.8792,-87.84312,24012),
(4901663,'McHenry','IL','US',42.33335,-88.26675,26657),
(4901868,'Melrose Park','IL','US',41.90059,-87.85673,25379),
(4902476,'Moline','IL','US',41.5067,-90.51513,42681),
(4902667,'Morgan Park','IL','US',41.69031,-87.66672,22924),
(4902763,'Morton Grove','IL','US',42.04059,-87.78256,23448),
(4903024,'Mount Prospect','IL','US',42.06642,-87.93729,54747),
(4903184,'Mundelein','IL','US',42.26308,-88.00397,31582),
(4903279,'Naperville','IL','US',41.78586,-88.14729,147100),
(4903360,'Near North Side','IL','US',41.90003,-87.6345,85711),
(4903363,'Near South Side','IL','US',41.8567,-87.62477,22401),
(4903466,'New City','IL','US',41.80753,-87.65644,40997),
(4903535,'New Lenox','IL','US',41.51198,-87.96561,25800),
(4903730,'Niles','IL','US',42.01892,-87.80284,29876),
(4903780,'Normal','IL','US',40.5142,-88.99063,54373),
(4903858,'North Center','IL','US',41.95392,-87.67895,34623),
(4903862,'North Chicago','IL','US',42.32558,-87.84118,29491),
(4903940,'North Lawndale','IL','US',41.86003,-87.71839,35276),
(4903976,'North Peoria','IL','US',40.71754,-89.58426,113004),
(4904056,'Northbrook','IL','US',42.12753,-87.82895,33663),
(4904286,'Oak Forest','IL','US',41.60281,-87.74394,28074),
(4904365,'Oak Lawn','IL','US',41.71087,-87.75811,56781),
(4904381,'Oak Park','IL','US',41.88503,-87.7845,52287),
(4904937,'Orland Park','IL','US',41.63031,-87.85394,58619),
(4904996,'Oswego','IL','US',41.68281,-88.35146,33955),
(4905211,'Palatine','IL','US',42.1103,-88.03424,69308),
(4905337,'Park Forest','IL','US',41.49142,-87.67449,21954),
(4905367,'Park Ridge','IL','US',42.01114,-87.84062,37757),
(4905599,'Pekin','IL','US',40.56754,-89.64066,33223),
(4905687,'Peoria','IL','US',40.69365,-89.58899,115070),
(4906125,'Plainfield','IL','US',41.62697,-88.20395,42527),
(4906500,'Portage Park','IL','US',41.95781,-87.76506,64841),
(4907907,'Rock Island','IL','US',41.50948,-90.57875,38620),
(4907959,'Rockford','IL','US',42.27113,-89.094,148278),
(4908033,'Rogers Park','IL','US',42.00864,-87.66672,54402),
(4908052,'Rolling Meadows','IL','US',42.08419,-88.01313,24190),
(4908068,'Romeoville','IL','US',41.64753,-88.08951,39719),
(4908173,'Roselle','IL','US',41.98475,-88.07979,22994),
(4908237,'Round Lake Beach','IL','US',42.37169,-88.09008,27852),
(4908737,'Saint Charles','IL','US',41.91419,-88.30869,32974),
(4910713,'Schaumburg','IL','US',42.03336,-88.08341,74693),
(4911600,'Skokie','IL','US',42.03336,-87.73339,64821),
(4911863,'South Chicago','IL','US',41.73977,-87.55425,28095),
(4911893,'South Elgin','IL','US',41.99419,-88.2923,22365),
(4911934,'South Holland','IL','US',41.60087,-87.60699,22043),
(4911951,'South Lawndale','IL','US',41.84364,-87.71255,73826),
(4912013,'South Shore','IL','US',41.76198,-87.57783,51451),
(4912691,'Streamwood','IL','US',42.02558,-88.17841,40554),
(4913723,'Tinley Park','IL','US',41.57337,-87.78449,57143),
(4914557,'Uptown','IL','US',41.9659,-87.65262,55137),
(4914570,'Urbana','IL','US',40.11059,-88.20727,42311),
(4914738,'Vernon Hills','IL','US',42.21947,-87.97952,26314),
(4914830,'Villa Park','IL','US',41.88975,-87.98895,21969),
(4915539,'Wasco','IL','US',41.93808,-88.40452,22560),
(4915734,'Waukegan','IL','US',42.36363,-87.84479,88475),
(4915963,'West Chicago','IL','US',41.88475,-88.20396,27447),
(4915989,'West Englewood','IL','US',41.77809,-87.66672,32156),
(4916028,'West Lawn','IL','US',41.77281,-87.72227,32749),
(4916079,'West Ridge','IL','US',41.99975,-87.69284,72211),
(4916118,'West Town','IL','US',41.89381,-87.67493,86429),
(4916207,'Westmont','IL','US',41.79586,-87.97562,24941),
(4916288,'Wheaton','IL','US',41.86614,-88.10701,53715),
(4916311,'Wheeling','IL','US',42.13919,-87.92896,38079),
(4916732,'Wilmette','IL','US',42.07225,-87.72284,27413),
(4917067,'Woodlawn','IL','US',41.77948,-87.59949,24150),
(4917089,'Woodridge','IL','US',41.74697,-88.05034,33370),
(4917123,'Woodstock','IL','US',42.31474,-88.4487,25189),
(4917358,'Zion','IL','US',42.44613,-87.83285,24117),
(4917592,'Anderson','IN','US',40.10532,-85.68025,55305),
(4919451,'Crown Point','IN','US',41.41698,-87.36531,28879),
(4919857,'East Chicago','IN','US',41.6392,-87.45476,28699),
(4919987,'Elkhart','IN','US',41.68199,-85.97667,52348)
on conflict (id) do nothing;
insert into places (id, name, state, country, lat, lng, population) values
(4920423,'Fort Wayne','IN','US',41.1306,-85.12886,260326),
(4920607,'Gary','IN','US',41.59337,-87.34643,77156),
(4920808,'Goshen','IN','US',41.58227,-85.83444,32983),
(4920869,'Granger','IN','US',41.75338,-86.11084,30465),
(4921100,'Hammond','IN','US',41.58337,-87.50004,77614),
(4921402,'Highland','IN','US',41.55365,-87.45198,22936),
(4921476,'Hobart','IN','US',41.53226,-87.25504,28404),
(4922388,'Kokomo','IN','US',40.48643,-86.1336,57995),
(4922459,'LaPorte','IN','US',41.6106,-86.72252,22053),
(4922462,'Lafayette','IN','US',40.4167,-86.87529,71111),
(4923210,'Marion','IN','US',40.55837,-85.65914,29081),
(4923482,'Merrillville','IN','US',41.48281,-87.33281,35224),
(4923531,'Michigan City','IN','US',41.70754,-86.89503,31459),
(4923670,'Mishawaka','IN','US',41.66199,-86.15862,48261),
(4924006,'Muncie','IN','US',40.19338,-85.38636,70087),
(4924014,'Munster','IN','US',41.56448,-87.51254,22984),
(4924198,'Noblesville','IN','US',40.04559,-86.0086,59093),
(4925006,'Portage','IN','US',41.57587,-87.17615,36738),
(4926170,'Schererville','IN','US',41.47892,-87.45476,28791),
(4926563,'South Bend','IN','US',41.68338,-86.25001,101516),
(4927537,'Valparaiso','IN','US',41.47309,-87.06114,32626),
(4928096,'West Lafayette','IN','US',40.42587,-86.90807,45550),
(4928118,'Westfield','IN','US',40.04282,-86.12749,36738),
(4928703,'Acton','MA','US',42.48509,-71.43284,20897),
(4928788,'Agawam','MA','US',42.06954,-72.61481,28761),
(4929022,'Amherst','MA','US',42.36723,-72.51852,39833),
(4929180,'Arlington','MA','US',42.41537,-71.15644,42844),
(4929399,'Attleboro','MA','US',41.94454,-71.28561,44284),
(4929771,'Barnstable','MA','US',41.70011,-70.29947,47821),
(4930282,'Belmont','MA','US',42.39593,-71.17867,24729),
(4930505,'Beverly','MA','US',42.55843,-70.88005,41186),
(4930511,'Beverly Cove','MA','US',42.55343,-70.85366,40365),
(4930577,'Billerica','MA','US',42.55843,-71.26895,39904),
(4930956,'Boston','MA','US',42.35843,-71.05977,667137),
(4931429,'Brockton','MA','US',42.08343,-71.01838,95314),
(4931482,'Brookline','MA','US',42.33176,-71.12116,58732),
(4931737,'Burlington','MA','US',42.50482,-71.19561,24498),
(4931972,'Cambridge','MA','US',42.3751,-71.10561,110402),
(4932214,'Canton','MA','US',42.15843,-71.14477,21679),
(4932869,'Chelmsford','MA','US',42.59981,-71.36728,33925),
(4932879,'Chelsea','MA','US',42.39176,-71.03283,39398),
(4933002,'Chicopee','MA','US',42.1487,-72.60787,56741),
(4934500,'Danvers','MA','US',42.57509,-70.93005,26493),
(4934664,'Dedham','MA','US',42.24177,-71.16616,24729),
(4935038,'Dracut','MA','US',42.67037,-71.30201,28831),
(4935623,'Easton','MA','US',42.02454,-71.12866,23459),
(4936008,'Everett','MA','US',42.40843,-71.05366,46050),
(4936159,'Fall River','MA','US',41.70149,-71.15505,88777),
(4936812,'Fitchburg','MA','US',42.58342,-71.8023,40545),
(4937230,'Framingham','MA','US',42.27926,-71.41617,68318),
(4937232,'Framingham Center','MA','US',42.29732,-71.43701,65413),
(4937276,'Franklin','MA','US',42.08343,-71.39673,30636),
(4937557,'Gardner','MA','US',42.57509,-71.99813,20333),
(4937829,'Gloucester','MA','US',42.61405,-70.66313,29781),
(4939085,'Haverhill','MA','US',42.7762,-71.07728,62765),
(4939783,'Holyoke','MA','US',42.20426,-72.6162,40684),
(4940764,'Jamaica Plain','MA','US',42.30982,-71.12033,37468),
(4941720,'Lawrence','MA','US',42.70704,-71.16311,80231),
(4941873,'Leominster','MA','US',42.52509,-71.75979,41569),
(4941935,'Lexington','MA','US',42.44732,-71.2245,31394),
(4942618,'Lowell','MA','US',42.63342,-71.31617,110699),
(4942744,'Ludlow','MA','US',42.16009,-72.47592,22201),
(4942807,'Lynn','MA','US',42.46676,-70.94949,92457),
(4942939,'Malden','MA','US',42.4251,-71.06616,61068),
(4943021,'Mansfield','MA','US',42.03343,-71.21894,23380),
(4943170,'Marlborough','MA','US',42.34593,-71.55229,39818),
(4943629,'Medford','MA','US',42.41843,-71.10616,57403),
(4943677,'Melrose','MA','US',42.45843,-71.06616,27997),
(4943828,'Methuen','MA','US',42.7262,-71.19089,47255),
(4943888,'Middleborough','MA','US',41.89316,-70.91115,23116),
(4943958,'Milford','MA','US',42.13982,-71.51617,25055),
(4944193,'Milton','MA','US',42.24954,-71.06616,27003),
(4944994,'Natick','MA','US',42.28343,-71.3495,32276),
(4945055,'Needham','MA','US',42.28343,-71.23283,28886),
(4945121,'New Bedford','MA','US',41.63526,-70.92701,94958),
(4945283,'Newton','MA','US',42.33704,-71.20922,88817),
(4945588,'North Chicopee','MA','US',42.18343,-72.59953,55179),
(4945819,'Northampton','MA','US',42.32509,-72.6412,28540),
(4945952,'Norwood','MA','US',42.19454,-71.1995,28602),
(4946863,'Peabody','MA','US',42.52787,-70.92866,52504),
(4947459,'Pittsfield','MA','US',42.45008,-73.24538,43303),
(4948247,'Quincy','MA','US',42.25288,-71.00227,93618),
(4948403,'Randolph','MA','US',42.1626,-71.04116,32112),
(4948462,'Reading','MA','US',42.52565,-71.09533,24747),
(4950065,'Salem','MA','US',42.51954,-70.89672,42869),
(4950267,'Saugus','MA','US',42.46482,-71.01005,26628),
(4950898,'Shrewsbury','MA','US',42.29593,-71.71285,33893),
(4951257,'Somerville','MA','US',42.3876,-71.0995,80318),
(4951305,'South Boston','MA','US',42.33343,-71.04949,571281),
(4951473,'South Peabody','MA','US',42.50982,-70.94949,50293),
(4951788,'Springfield','MA','US',42.10148,-72.58981,154341),
(4952121,'Stoneham','MA','US',42.4801,-71.0995,21437),
(4952206,'Stoughton','MA','US',42.1251,-71.10227,26915),
(4952629,'Taunton','MA','US',41.9001,-71.08977,56789),
(4952762,'Tewksbury','MA','US',42.61065,-71.23422,29326),
(4954265,'Wakefield','MA','US',42.50648,-71.07283,24932),
(4954380,'Waltham','MA','US',42.37649,-71.23561,63378),
(4954611,'Watertown','MA','US',42.37093,-71.18283,31915),
(4954738,'Wellesley','MA','US',42.29649,-71.29256,27982),
(4955089,'West Springfield','MA','US',42.10704,-72.62037,27912),
(4955190,'Westfield','MA','US',42.12509,-72.74954,41690),
(4955219,'Westford','MA','US',42.57926,-71.43784,21587),
(4955336,'Weymouth','MA','US',42.22093,-70.93977,54395),
(4955840,'Wilmington','MA','US',42.54648,-71.17367,22325),
(4955884,'Winchester','MA','US',42.45232,-71.137,21374),
(4956032,'Woburn','MA','US',42.47926,-71.15228,39555),
(4956184,'Worcester','MA','US',42.26259,-71.80229,184815),
(4956335,'Yarmouth','MA','US',41.70567,-70.22863,25243),
(4956976,'Auburn','ME','US',44.09785,-70.23117,22871),
(4957280,'Bangor','ME','US',44.80118,-68.77781,32391),
(4958141,'Biddeford','ME','US',43.49258,-70.45338,21282),
(4969398,'Lewiston','ME','US',44.10035,-70.21478,36202),
(4975802,'Portland','ME','US',43.65737,-70.2589,66881),
(4977762,'Sanford','ME','US',43.43925,-70.77422,20893),
(4979244,'South Portland','ME','US',43.64147,-70.24088,25556),
(4979245,'South Portland Gardens','ME','US',43.63897,-70.31533,23893),
(4982720,'West Scarborough','ME','US',43.57036,-70.38783,27706),
(4983811,'Adrian','MI','US',41.89755,-84.03717,20691),
(4984016,'Allen Park','MI','US',42.25754,-83.21104,27425),
(4984247,'Ann Arbor','MI','US',42.27756,-83.74088,117070),
(4984565,'Auburn Hills','MI','US',42.68753,-83.2341,22672),
(4985153,'Battle Creek','MI','US',42.3173,-85.17816,51589),
(4985180,'Bay City','MI','US',43.59447,-83.88886,33917),
(4986172,'Birmingham','MI','US',42.5467,-83.21132,20857),
(4987482,'Burton','MI','US',42.99947,-83.61634,28788),
(4987990,'Canton','MI','US',42.30865,-83.48216,86825),
(4989133,'Clinton Township','MI','US',42.58698,-82.91992,99753),
(4990510,'Dearborn','MI','US',42.32226,-83.17631,95171),
(4990512,'Dearborn Heights','MI','US',42.33698,-83.27326,56145),
(4990729,'Detroit','MI','US',42.33143,-83.04575,677116),
(4991640,'East Lansing','MI','US',42.73698,-84.48387,48471),
(4991735,'Eastpointe','MI','US',42.46837,-82.95547,32657),
(4992523,'Farmington Hills','MI','US',42.48531,-83.37716,81330),
(4992635,'Ferndale','MI','US',42.46059,-83.13465,20177),
(4992982,'Flint','MI','US',43.01253,-83.68746,98310),
(4993125,'Forest Hills','MI','US',42.95947,-85.48975,25867),
(4993659,'Garden City','MI','US',42.32559,-83.33104,26920),
(4994358,'Grand Rapids','MI','US',42.96336,-85.66809,195097),
(4995197,'Hamtramck','MI','US',42.39282,-83.04964,22002),
(4996248,'Holland','MI','US',42.78752,-86.10893,33742),
(4996306,'Holt','MI','US',42.64059,-84.51525,23973),
(4997384,'Jackson','MI','US',42.24587,-84.40135,33133),
(4997787,'Kalamazoo','MI','US',42.29171,-85.58723,76041),
(4998018,'Kentwood','MI','US',42.86947,-85.64475,51357),
(4998830,'Lansing','MI','US',42.73253,-84.55553,115056),
(4999311,'Lincoln Park','MI','US',42.25059,-83.17854,37012),
(4999837,'Livonia','MI','US',42.36837,-83.35271,94635),
(5000500,'Madison Heights','MI','US',42.48587,-83.1052,30198),
(5000947,'Marquette','MI','US',46.54354,-87.39542,21297),
(5001929,'Midland','MI','US',43.61558,-84.24721,42200),
(5002344,'Monroe','MI','US',41.91643,-83.39771,20092),
(5002714,'Mount Pleasant','MI','US',43.59781,-84.76751,26060),
(5003132,'Muskegon','MI','US',43.23418,-86.24839,38401),
(5004005,'Norton Shores','MI','US',43.1689,-86.26395,24208),
(5004062,'Novi','MI','US',42.48059,-83.47549,58723),
(5004188,'Oak Park','MI','US',42.45948,-83.18271,29752),
(5004359,'Okemos','MI','US',42.72226,-84.42747,21369),
(5006166,'Pontiac','MI','US',42.63892,-83.29105,59917),
(5006233,'Port Huron','MI','US',42.97086,-82.42491,29330),
(5006250,'Portage','MI','US',42.20115,-85.58,48177),
(5006917,'Redford','MI','US',42.38337,-83.2966,49936),
(5007402,'Rochester Hills','MI','US',42.65837,-83.14993,73424),
(5007531,'Romulus','MI','US',42.22226,-83.3966,23417),
(5007655,'Roseville','MI','US',42.49726,-82.93714,47637),
(5007804,'Royal Oak','MI','US',42.48948,-83.14465,59008),
(5007989,'Saginaw','MI','US',43.41947,-83.95081,49347),
(5009586,'Shelby','MI','US',42.67087,-83.03298,74099),
(5010636,'Southfield','MI','US',42.47337,-83.22187,73156),
(5010646,'Southgate','MI','US',42.21393,-83.19381,29293),
(5010978,'Saint Clair Shores','MI','US',42.49698,-82.88881,59715),
(5011148,'Sterling Heights','MI','US',42.58031,-83.0302,132052),
(5011908,'Taylor','MI','US',42.24087,-83.26965,61568),
(5012639,'Troy','MI','US',42.60559,-83.14993,83280),
(5013924,'Walker','MI','US',43.00141,-85.76809,24647),
(5014051,'Warren','MI','US',42.49044,-83.01304,134056),
(5014130,'Waterford','MI','US',42.69303,-83.41181,75737),
(5014208,'Waverly','MI','US',42.7392,-84.62081,23925),
(5014681,'Westland','MI','US',42.3242,-83.40021,82000),
(5015599,'Wyandotte','MI','US',42.21421,-83.14992,25156),
(5015618,'Wyoming','MI','US',42.91336,-85.70531,75275),
(5016374,'Andover','MN','US',45.2333,-93.29134,32213),
(5016494,'Apple Valley','MN','US',44.73191,-93.21772,51221),
(5016884,'Austin','MN','US',43.66663,-92.97464,24563),
(5018651,'Blaine','MN','US',45.1608,-93.23495,62124),
(5018739,'Bloomington','MN','US',44.8408,-93.29828,86435),
(5019330,'Brooklyn Center','MN','US',45.07608,-93.33273,30770),
(5019335,'Brooklyn Park','MN','US',45.09413,-93.35634,79149),
(5019767,'Burnsville','MN','US',44.76774,-93.27772,61481),
(5020859,'Champlin','MN','US',45.18885,-93.39745,23894),
(5020881,'Chanhassen','MN','US',44.86219,-93.53079,25332),
(5020938,'Chaska','MN','US',44.78941,-93.60218,25199),
(5022025,'Coon Rapids','MN','US',45.11997,-93.28773,62240),
(5022134,'Cottage Grove','MN','US',44.82774,-92.94382,35918),
(5023571,'Crystal','MN','US',45.03274,-93.36023,22943),
(5024719,'Duluth','MN','US',46.78327,-92.10658,86110),
(5024825,'Eagan','MN','US',44.80413,-93.16689,66286),
(5025219,'Eden Prairie','MN','US',44.85469,-93.47079,63496),
(5025264,'Edina','MN','US',44.88969,-93.34995,50138),
(5025471,'Elk River','MN','US',45.30385,-93.56718,23963),
(5026291,'Faribault','MN','US',44.29496,-93.26883,23650),
(5026321,'Farmington','MN','US',44.64024,-93.14355,22731),
(5027482,'Fridley','MN','US',45.08608,-93.26328,27713),
(5028163,'Golden Valley','MN','US',45.00969,-93.34912,21270),
(5029500,'Hastings','MN','US',44.7433,-92.85243,22554),
(5031412,'Inver Grove Heights','MN','US',44.84802,-93.04272,34857),
(5034059,'Lakeville','MN','US',44.64969,-93.24272,60633),
(5034767,'Lino Lakes','MN','US',45.16024,-93.08883,21050),
(5036420,'Mankato','MN','US',44.15906,-94.00915,41044),
(5036493,'Maple Grove','MN','US',45.07246,-93.45579,68385),
(5036588,'Maplewood','MN','US',44.95302,-92.99522,40567),
(5037649,'Minneapolis','MN','US',44.97997,-93.26384,410939),
(5037784,'Minnetonka','MN','US',44.9133,-93.50329,51669),
(5037790,'Minnetonka Mills','MN','US',44.94107,-93.4419,50117),
(5038108,'Moorhead','MN','US',46.87386,-96.76951,42005),
(5039080,'New Brighton','MN','US',45.06552,-93.20189,22351),
(5039094,'New Hope','MN','US',45.03802,-93.38662,21032),
(5039675,'Northfield','MN','US',44.4583,-93.1616,20380),
(5039978,'Oakdale','MN','US',44.96302,-92.96494,28080),
(5040647,'Owatonna','MN','US',44.08385,-93.22604,25725),
(5041926,'Plymouth','MN','US',45.01052,-93.45551,75907),
(5042373,'Prior Lake','MN','US',44.7133,-93.42273,25282),
(5042561,'Ramsey','MN','US',45.2611,-93.45,25828),
(5043193,'Richfield','MN','US',44.8833,-93.283,36216),
(5043473,'Rochester','MN','US',44.02163,-92.4699,112225),
(5043779,'Rosemount','MN','US',44.73941,-93.12577,23413),
(5043799,'Roseville','MN','US',45.00608,-93.15661,35580),
(5044407,'Saint Cloud','MN','US',45.5608,-94.16249,65842),
(5045021,'Saint Louis Park','MN','US',44.9483,-93.34801,45250),
(5045360,'Saint Paul','MN','US',44.94441,-93.09327,285068),
(5046063,'Savage','MN','US',44.77913,-93.33634,30391),
(5046997,'Shakopee','MN','US',44.79802,-93.5269,39981),
(5047234,'Shoreview','MN','US',45.07913,-93.14717,26477),
(5048033,'South Saint Paul','MN','US',44.89274,-93.03494,20160),
(5052361,'West Coon Rapids','MN','US',45.15969,-93.34967,62528),
(5052658,'White Bear Lake','MN','US',45.08469,-93.00994,25205),
(5053156,'Winona','MN','US',44.04996,-91.63932,27094),
(5053358,'Woodbury','MN','US',44.92386,-92.95938,67855),
(5059163,'Fargo','ND','US',46.87719,-96.7898,118523),
(5059429,'Grand Forks','ND','US',47.92526,-97.03285,57011),
(5062458,'West Fargo','ND','US',46.87497,-96.90036,33597),
(5063805,'Bellevue','NE','US',41.13667,-95.89084,55510),
(5066001,'Columbus','NE','US',41.42973,-97.36838,22797),
(5068725,'Fremont','NE','US',41.43333,-96.49808,26474),
(5069297,'Grand Island','NE','US',40.92501,-98.34201,51440),
(5069802,'Hastings','NE','US',40.58612,-98.38839,24924),
(5071348,'Kearney','NE','US',40.69946,-99.08148,33021),
(5072006,'Lincoln','NE','US',40.8,-96.66696,277348),
(5073965,'Norfolk','NE','US',42.02834,-97.417,24366),
(5074472,'Omaha','NE','US',41.25626,-95.94043,443885),
(5083221,'Bedford','NH','US',42.94647,-71.5159,21188),
(5084868,'Concord','NH','US',43.20814,-71.53757,42620),
(5085374,'Derry','NH','US',42.88064,-71.32729,22015),
(5085382,'Derry Village','NH','US',42.89175,-71.31201,34539),
(5085520,'Dover','NH','US',43.19786,-70.87367,30880),
(5085688,'East Concord','NH','US',43.24202,-71.53813,42605),
(5088262,'Keene','NH','US',42.93369,-72.27814,23265),
(5089178,'Manchester','NH','US',42.99564,-71.45479,110229),
(5089478,'Merrimack','NH','US',42.86509,-71.4934,26726),
(5090046,'Nashua','NH','US',42.76537,-71.46757,87970),
(5091383,'Portsmouth','NH','US',43.07704,-70.75766,21530),
(5091872,'Rochester','NH','US',43.30453,-70.97562,30038),
(5092268,'Salem','NH','US',42.78842,-71.20089,29549),
(5095445,'Bayonne','NJ','US',40.66871,-74.11431,66311),
(5095549,'Belleville','NJ','US',40.79371,-74.15014,36878),
(5095611,'Bergenfield','NJ','US',40.9276,-73.99736,27621),
(5095779,'Bloomfield','NJ','US',40.80677,-74.18542,49120),
(5096316,'Carteret','NJ','US',40.57733,-74.2282,24170),
(5096686,'Cliffside Park','NJ','US',40.82149,-73.98764,24857),
(5096699,'Clifton','NJ','US',40.85843,-74.16376,86334),
(5097017,'Cranford','NJ','US',40.65844,-74.29959,22627),
(5097402,'East Brunswick','NJ','US',40.42788,-74.41598,48495),
(5097441,'East Orange','NJ','US',40.76732,-74.20487,64949),
(5097529,'Edison','NJ','US',40.51872,-74.4121,102548),
(5097598,'Elizabeth','NJ','US',40.66399,-74.2107,129007),
(5097627,'Elmwood Park','NJ','US',40.90399,-74.11848,20279),
(5097672,'Englewood','NJ','US',40.89288,-73.97264,28539),
(5097751,'Ewing','NJ','US',40.26983,-74.79988,36559),
(5097773,'Fair Lawn','NJ','US',40.94038,-74.13181,33597),
(5098135,'Fort Lee','NJ','US',40.85093,-73.97014,36672),
(5098343,'Garfield','NJ','US',40.88149,-74.1132,31802),
(5098706,'Hackensack','NJ','US',40.88593,-74.04347,44834),
(5099093,'Hillside','NJ','US',40.70121,-74.23015,22155),
(5099133,'Hoboken','NJ','US',40.74399,-74.03236,53635),
(5099724,'Irvington','NJ','US',40.73232,-74.23487,61323),
(5099836,'Jersey City','NJ','US',40.72816,-74.07764,264290),
(5099967,'Kearny','NJ','US',40.76843,-74.14542,42137),
(5100280,'Lakewood','NJ','US',40.09789,-74.21764,53805),
(5100506,'Linden','NJ','US',40.62205,-74.24459,42021),
(5100572,'Livingston','NJ','US',40.79593,-74.31487,27853),
(5100604,'Lodi','NJ','US',40.88232,-74.0832,24835),
(5100619,'Long Branch','NJ','US',40.30428,-73.99236,30941),
(5100776,'Mahwah','NJ','US',41.08871,-74.14376,24062),
(5100854,'Maplewood','NJ','US',40.73121,-74.27348,25008),
(5100886,'Marlboro','NJ','US',40.31539,-74.24626,40191),
(5101334,'Montclair','NJ','US',40.82593,-74.20903,39701),
(5101717,'New Brunswick','NJ','US',40.48622,-74.45182,57035),
(5101798,'Newark','NJ','US',40.73566,-74.17237,281944),
(5101879,'North Bergen','NJ','US',40.80427,-74.01208,63484),
(5101938,'North Plainfield','NJ','US',40.6301,-74.42737,22140),
(5102076,'Nutley','NJ','US',40.82232,-74.15987,27572),
(5102162,'Old Bridge','NJ','US',40.41483,-74.36543,23753),
(5102213,'Orange','NJ','US',40.77066,-74.23265,34457),
(5102369,'Palisades Park','NJ','US',40.84816,-73.99764,20743),
(5102387,'Paramus','NJ','US',40.94454,-74.07542,26974),
(5102427,'Parsippany','NJ','US',40.85788,-74.42599,51144),
(5102443,'Passaic','NJ','US',40.85677,-74.12848,71085),
(5102466,'Paterson','NJ','US',40.91677,-74.17181,147754),
(5102578,'Perth Amboy','NJ','US',40.50677,-74.26542,52682),
(5102713,'Piscataway','NJ','US',40.49927,-74.39904,56044),
(5102720,'Plainfield','NJ','US',40.63371,-74.40737,51217),
(5102922,'Princeton','NJ','US',40.34872,-74.65905,29603),
(5103055,'Rahway','NJ','US',40.60816,-74.27765,29508),
(5103269,'Ridgewood','NJ','US',40.97926,-74.11653,25621),
(5103500,'Roselle','NJ','US',40.65223,-74.25882,21670),
(5104404,'Sayreville','NJ','US',40.45927,-74.36098,44920),
(5104405,'Sayreville Junction','NJ','US',40.46538,-74.33043,42890),
(5104473,'Scotch Plains','NJ','US',40.65538,-74.38987,23584),
(5104755,'Somerset','NJ','US',40.4976,-74.48849,22083),
(5104835,'South Old Bridge','NJ','US',40.40816,-74.35432,23233),
(5104844,'South Plainfield','NJ','US',40.57927,-74.41154,24290),
(5105127,'Summit','NJ','US',40.71562,-74.36468,22074),
(5105262,'Teaneck','NJ','US',40.8976,-74.01597,40078),
(5105496,'Trenton','NJ','US',40.21705,-74.74294,84225),
(5105608,'Union','NJ','US',40.6976,-74.2632,56771),
(5105634,'Union City','NJ','US',40.77955,-74.02375,69156),
(5105860,'Voorhees','NJ','US',40.48122,-74.48321,29131),
(5106160,'Wayne','NJ','US',40.92538,-74.27654,57915),
(5106279,'West Milford','NJ','US',41.13121,-74.36737,26968),
(5106292,'West New York','NJ','US',40.78788,-74.01431,53366),
(5106298,'West Orange','NJ','US',40.79871,-74.23904,48131),
(5106331,'Westfield','NJ','US',40.65899,-74.34737,30548),
(5106453,'Willingboro','NJ','US',40.02789,-74.86905,31668),
(5106834,'Albany','NY','US',42.65258,-73.75623,98469),
(5107129,'Amherst','NY','US',42.97839,-78.79976,122366),
(5107464,'Astoria','NY','US',40.77205,-73.93014,150165),
(5107505,'Auburn','NY','US',42.93173,-76.56605,26985),
(5107760,'Baldwin','NY','US',40.65649,-73.6093,24033),
(5108111,'Bath Beach','NY','US',40.60455,-74.00431,33080),
(5108169,'Bay Shore','NY','US',40.7251,-73.24539,26337),
(5108193,'Bayside','NY','US',40.76844,-73.77708,66455),
(5108815,'Bensonhurst','NY','US',40.60177,-73.99403,60000),
(5109177,'Binghamton','NY','US',42.09869,-75.91797,46032),
(5109790,'Borough Park','NY','US',40.63399,-73.99681,149248),
(5110077,'Brentwood','NY','US',40.78121,-73.24623,60664),
(5110159,'Brighton','NY','US',43.14756,-77.55055,36609),
(5110161,'Brighton Beach','NY','US',40.57788,-73.95958,31462),
(5110266,'The Bronx','NY','US',40.84985,-73.86641,1385108),
(5110302,'Brooklyn','NY','US',40.6501,-73.94958,2300664),
(5110309,'Brooklyn Heights','NY','US',40.69538,-73.99375,20256),
(5110446,'Brownsville','NY','US',40.66094,-73.92014,74497),
(5110629,'Buffalo','NY','US',42.88645,-78.87837,258071),
(5110918,'Bushwick','NY','US',40.69427,-73.91875,112620),
(5111141,'Cambria Heights','NY','US',40.69455,-73.73847,20287),
(5111412,'Canarsie','NY','US',40.64372,-73.90069,87366),
(5112035,'Centereach','NY','US',40.85843,-73.09955,31578),
(5112078,'Central Islip','NY','US',40.79065,-73.20178,34450),
(5112375,'Cheektowaga','NY','US',42.90339,-78.75475,75178),
(5112540,'Chinatown','NY','US',40.71649,-73.99625,90000),
(5113302,'College Point','NY','US',40.7876,-73.84597,27307),
(5113412,'Commack','NY','US',40.84288,-73.29289,36124),
(5113481,'Coney Island','NY','US',40.57788,-73.99403,60000),
(5113683,'Copiague','NY','US',40.68149,-73.39984,22993),
(5113694,'Coram','NY','US',40.86871,-73.00149,39113),
(5113779,'Corona','NY','US',40.74705,-73.86014,109698),
(5114418,'Cypress Hills','NY','US',40.67705,-73.89125,54944),
(5114731,'Deer Park','NY','US',40.76177,-73.32929,27745),
(5115107,'Dix Hills','NY','US',40.80482,-73.33623,26892),
(5115614,'Dyker Heights','NY','US',40.62149,-74.00958,34399),
(5115835,'East Elmhurst','NY','US',40.76121,-73.86514,23150),
(5115843,'East Flatbush','NY','US',40.65371,-73.93042,178464),
(5115960,'East Meadow','NY','US',40.71399,-73.55902,38132),
(5115985,'East New York','NY','US',40.66677,-73.88236,173198),
(5115989,'East Northport','NY','US',40.87676,-73.32456,20217),
(5116004,'East Patchogue','NY','US',40.76704,-72.99622,22469),
(5116083,'East Tremont','NY','US',40.84538,-73.89097,22886),
(5116093,'East Village','NY','US',40.72927,-73.98736,62832),
(5116495,'Elmhurst','NY','US',40.73649,-73.87791,113364),
(5116497,'Elmira','NY','US',42.0898,-76.80773,28213),
(5116508,'Elmont','NY','US',40.70094,-73.71291,33198),
(5116917,'Far Rockaway','NY','US',40.60538,-73.75513,39189),
(5117378,'Flatbush','NY','US',40.65205,-73.95903,93361),
(5117388,'Flatlands','NY','US',40.62122,-73.93486,63601),
(5117549,'Fordham','NY','US',40.85927,-73.89847,94678),
(5117575,'Forest Hills','NY','US',40.71621,-73.85014,67714),
(5117663,'Fort Hamilton','NY','US',40.61872,-74.0332,28966),
(5117891,'Franklin Square','NY','US',40.70732,-73.67596,29320),
(5117949,'Freeport','NY','US',40.6576,-73.58318,43334),
(5118005,'Fresh Meadows','NY','US',40.73482,-73.79347,28397),
(5118226,'Garden City','NY','US',40.72677,-73.6343,22612),
(5118626,'Glen Cove','NY','US',40.86232,-73.63374,27400),
(5118670,'Glendale','NY','US',40.70149,-73.8868,34389),
(5119019,'Grand Island','NY','US',43.03311,-78.96254,20813),
(5119167,'Gravesend','NY','US',40.5976,-73.96514,112229),
(5119211,'Great Kills','NY','US',40.55427,-74.15153,22000),
(5119347,'Greenburgh','NY','US',41.03287,-73.84291,86764),
(5119383,'Greenpoint','NY','US',40.72371,-73.95097,34719),
(5120034,'Harlem','NY','US',40.80788,-73.94542,116345),
(5120095,'Harrison','NY','US',40.96899,-73.71263,28348),
(5120228,'Hauppauge','NY','US',40.82565,-73.20261,20882),
(5120442,'Hell''s Kitchen','NY','US',40.76496,-73.9909,45884),
(5120478,'Hempstead','NY','US',40.70621,-73.61874,55547),
(5120656,'Hicksville','NY','US',40.76843,-73.52513,41547),
(5120824,'Hillside','NY','US',40.70788,-73.7868,24808),
(5120987,'Holbrook','NY','US',40.81232,-73.07844,27195),
(5121026,'Hollis','NY','US',40.71344,-73.76708,20269),
(5121407,'Howard Beach','NY','US',40.65788,-73.83625,26148),
(5121650,'Huntington Station','NY','US',40.85343,-73.41151,33029),
(5121666,'Hunts Point','NY','US',40.8126,-73.88402,27204),
(5122331,'Irondequoit','NY','US',43.2134,-77.57972,51692),
(5122432,'Ithaca','NY','US',42.44063,-76.49661,30788),
(5122477,'Jackson Heights','NY','US',40.75566,-73.88541,67067),
(5122520,'Jamaica','NY','US',40.69149,-73.80569,216866),
(5122534,'Jamestown','NY','US',42.097,-79.23533,30075),
(5123280,'Kensington','NY','US',40.64621,-73.97069,39120),
(5123443,'Kings Bridge','NY','US',40.87871,-73.90514,75132),
(5123477,'Kingston','NY','US',41.92704,-73.99736,23436),
(5123533,'Kiryas Joel','NY','US',41.34204,-74.16792,22851),
(5123840,'Lake Ronkonkoma','NY','US',40.8351,-73.13122,20155),
(5124045,'Latham','NY','US',42.74702,-73.75901,20736),
(5124078,'Laurelton','NY','US',40.67019,-73.74659,21053),
(5124276,'Levittown','NY','US',40.72593,-73.51429,51881),
(5124497,'Lindenhurst','NY','US',40.68677,-73.37345,27277),
(5125011,'Lockport','NY','US',43.17061,-78.69031,20624),
(5125086,'Long Beach','NY','US',40.58844,-73.65791,33550),
(5125125,'Long Island City','NY','US',40.74482,-73.94875,25595),
(5125771,'Manhattan','NY','US',40.78343,-73.96625,1487536),
(5126180,'Maspeth','NY','US',40.72316,-73.91264,48325),
(5126183,'Massapequa','NY','US',40.68066,-73.47429,21685),
(5126518,'Medford','NY','US',40.8176,-73.00011,24142),
(5126550,'Melrose','NY','US',40.82455,-73.91041,22470),
(5126630,'Merrick','NY','US',40.66288,-73.55152,22097),
(5126827,'Middle Village','NY','US',40.71649,-73.88125,29491),
(5126842,'Middletown','NY','US',41.44593,-74.42293,27812),
(5127536,'Morris Heights','NY','US',40.84982,-73.91986,40982),
(5127550,'Morrisania','NY','US',40.82927,-73.90653,23127),
(5127670,'Mott Haven','NY','US',40.80899,-73.92291,51450),
(5127835,'Mount Vernon','NY','US',40.9126,-73.83708,68628),
(5128481,'New City','NY','US',41.1476,-73.98931,33559),
(5128549,'New Rochelle','NY','US',40.91149,-73.78235,79846),
(5128566,'New Springville','NY','US',40.59344,-74.1632,20756),
(5128581,'New York City','NY','US',40.71427,-74.00597,8175133),
(5128654,'Newburgh','NY','US',41.50343,-74.01042,28290),
(5128723,'Niagara Falls','NY','US',43.0945,-79.05671,48916),
(5129245,'North Tonawanda','NY','US',43.03867,-78.8642,30785),
(5129603,'Oceanside','NY','US',40.63871,-73.64013,32109),
(5130045,'Ossining','NY','US',41.16287,-73.86152,25441),
(5130334,'Ozone Park','NY','US',40.67677,-73.84375,53985),
(5130561,'Park Slope','NY','US',40.6701,-73.98597,65047),
(5130572,'Parkchester','NY','US',40.83899,-73.86041,65876),
(5130831,'Peekskill','NY','US',41.29009,-73.92042,24043),
(5131638,'Plainview','NY','US',40.77649,-73.46735,26217),
(5132002,'Port Chester','NY','US',41.00176,-73.66568,29620),
(5132143,'Poughkeepsie','NY','US',41.70037,-73.92097,30371),
(5133271,'Queens Village','NY','US',40.72677,-73.74152,51919),
(5133273,'Queens','NY','US',40.68149,-73.83652,2272771),
(5133279,'Queensbury','NY','US',43.37729,-73.61317,27703),
(5133640,'Rego Park','NY','US',40.72649,-73.85264,43925),
(5133825,'Richmond Hill','NY','US',40.69983,-73.83125,98984),
(5133858,'Ridgewood','NY','US',40.7001,-73.90569,69317),
(5134086,'Rochester','NY','US',43.15478,-77.61556,209802),
(5134203,'Rockville Centre','NY','US',40.65871,-73.64124,24201),
(5134295,'Rome','NY','US',43.21285,-75.45573,32573),
(5134395,'Rosedale','NY','US',40.66205,-73.73541,25812),
(5134453,'Rotterdam','NY','US',42.78702,-73.97096,20652),
(5136334,'Saratoga Springs','NY','US',43.08313,-73.78457,27765),
(5136454,'Schenectady','NY','US',42.81424,-73.93957,65305),
(5137849,'Sheepshead Bay','NY','US',40.59122,-73.94458,122534),
(5138022,'Shirley','NY','US',40.80149,-72.8676,27854),
(5138539,'Smithtown','NY','US',40.85593,-73.20067,26470),
(5139287,'Springfield Gardens','NY','US',40.66312,-73.76221,30515),
(5139301,'Spring Valley','NY','US',41.11315,-74.04375,32598),
(5139568,'Staten Island','NY','US',40.56233,-74.13986,468730),
(5140221,'Sunnyside','NY','US',40.73982,-73.93542,49833),
(5140405,'Syracuse','NY','US',43.04812,-76.14742,144142),
(5140945,'Throgs Neck','NY','US',40.8226,-73.81958,33683),
(5141342,'Tremont','NY','US',40.84954,-73.90569,22870),
(5141502,'Troy','NY','US',42.72841,-73.69179,49906),
(5141927,'Uniondale','NY','US',40.70038,-73.59291,24759),
(5141930,'Unionport','NY','US',40.82732,-73.85013,23895),
(5141963,'University Heights','NY','US',40.8601,-73.9093,27935),
(5142056,'Utica','NY','US',43.1009,-75.23266,61100),
(5142109,'Valley Stream','NY','US',40.66427,-73.70846,37962),
(5142182,'Van Nest','NY','US',40.84843,-73.86375,23700),
(5143056,'Wakefield','NY','US',40.89788,-73.85236,52201),
(5143307,'Washington Heights','NY','US',40.8501,-73.93541,152613),
(5143396,'Watertown','NY','US',43.97478,-75.91076,26780),
(5143620,'West Albany','NY','US',42.68313,-73.77845,93794),
(5143630,'West Babylon','NY','US',40.71816,-73.35429,43213),
(5143866,'West Islip','NY','US',40.70621,-73.30623,28335),
(5143992,'West Seneca','NY','US',42.85006,-78.79975,44711),
(5144336,'White Plains','NY','US',41.03399,-73.76291,58459),
(5144400,'Whitestone','NY','US',40.79455,-73.81847,36984),
(5144580,'Williamsburg','NY','US',40.71427,-73.95347,33000),
(5144975,'Woodhaven','NY','US',40.68927,-73.85791,36555),
(5145034,'Woodrow','NY','US',40.54344,-74.19764,21005),
(5145067,'Woodside','NY','US',40.74538,-73.90541,41981),
(5145215,'Yonkers','NY','US',40.93121,-73.89875,201116),
(5145476,'Akron','OH','US',41.08144,-81.51901,197542),
(5145607,'Alliance','OH','US',40.91534,-81.10593,22055),
(5146055,'Ashland','OH','US',40.86867,-82.31822,20317)
on conflict (id) do nothing;
insert into places (id, name, state, country, lat, lng, population) values
(5146256,'Austintown','OH','US',41.10172,-80.76452,29677),
(5146277,'Avon','OH','US',41.45171,-82.03542,22544),
(5146286,'Avon Lake','OH','US',41.50532,-82.0282,23453),
(5146491,'Barberton','OH','US',41.01283,-81.60512,26234),
(5147784,'Boardman','OH','US',41.02423,-80.66285,35376),
(5147968,'Bowling Green','OH','US',41.37477,-83.65132,31246),
(5148480,'Brunswick','OH','US',41.23811,-81.8418,34689),
(5149222,'Canton','OH','US',40.79895,-81.37845,71885),
(5150529,'Cleveland','OH','US',41.4995,-81.69541,388072),
(5150792,'Collinwood','OH','US',41.55838,-81.56929,34220),
(5151613,'Cuyahoga Falls','OH','US',41.13394,-81.48456,49146),
(5151891,'Delaware','OH','US',40.29867,-83.06797,37995),
(5152333,'Dublin','OH','US',40.09923,-83.11408,45098),
(5153207,'Elyria','OH','US',41.36838,-82.10765,53775),
(5153420,'Euclid','OH','US',41.5931,-81.52679,47676),
(5153924,'Findlay','OH','US',41.04422,-83.64993,41149),
(5155393,'Gahanna','OH','US',40.01923,-82.87934,34590),
(5155499,'Garfield Heights','OH','US',41.417,-81.60596,28097),
(5155858,'Glenville','OH','US',41.53338,-81.61735,23559),
(5156371,'Green','OH','US',40.94589,-81.48317,25898),
(5157588,'Hilliard','OH','US',40.0334,-83.15825,33649),
(5158164,'Hudson','OH','US',41.24006,-81.44067,22437),
(5159537,'Kent','OH','US',41.15367,-81.35789,29810),
(5160315,'Lakewood','OH','US',41.48199,-81.79819,50656),
(5160783,'Lima','OH','US',40.74255,-84.10523,37873),
(5161262,'Lorain','OH','US',41.45282,-82.18237,63647),
(5161723,'Mansfield','OH','US',40.75839,-82.51545,46830),
(5161803,'Maple Heights','OH','US',41.41533,-81.56596,22631),
(5161902,'Marion','OH','US',40.58867,-83.12852,36363),
(5162077,'Marysville','OH','US',40.23645,-83.36714,22817),
(5162097,'Massillon','OH','US',40.79672,-81.52151,32252),
(5162512,'Medina','OH','US',41.13839,-81.86375,26339),
(5162645,'Mentor','OH','US',41.66616,-81.33955,46901),
(5164466,'Newark','OH','US',40.05812,-82.40126,47986),
(5164862,'North Olmsted','OH','US',41.4156,-81.92347,32004),
(5164903,'North Ridgeville','OH','US',41.38949,-82.01903,32483),
(5164916,'North Royalton','OH','US',41.31366,-81.72457,30311),
(5165734,'Oregon','OH','US',41.64366,-83.48688,20102),
(5166177,'Parma','OH','US',41.40477,-81.72291,79937),
(5166184,'Parma Heights','OH','US',41.39005,-81.75958,20246),
(5166516,'Perrysburg','OH','US',41.557,-83.62716,21423),
(5166819,'Piqua','OH','US',40.14477,-84.24244,20790),
(5168491,'Rocky River','OH','US',41.4756,-81.8393,20376),
(5170691,'Sandusky','OH','US',41.44894,-82.70796,25212),
(5171728,'Shaker Heights','OH','US',41.47394,-81.53707,27646),
(5172078,'Sidney','OH','US',40.28422,-84.1555,20858),
(5172387,'Solon','OH','US',41.38978,-81.44123,23043),
(5172485,'South Euclid','OH','US',41.52311,-81.51846,21794),
(5173171,'Stow','OH','US',41.1595,-81.44039,34797),
(5173237,'Strongsville','OH','US',41.3145,-81.83569,44668),
(5174035,'Toledo','OH','US',41.66394,-83.55521,279789),
(5174358,'Troy','OH','US',40.0395,-84.20328,25659),
(5175496,'Wadsworth','OH','US',41.02561,-81.72985,21860),
(5175865,'Warren','OH','US',41.23756,-80.81842,40245),
(5176472,'Westerville','OH','US',40.12617,-82.92907,38384),
(5176517,'Westlake','OH','US',41.45532,-81.91792,32428),
(5176937,'Willoughby','OH','US',41.63977,-81.4065,22631),
(5177358,'Wooster','OH','US',40.80517,-81.93646,26749),
(5177568,'Youngstown','OH','US',41.09978,-80.64952,64628),
(5178127,'Allentown','PA','US',40.60843,-75.49018,120207),
(5178165,'Allison Park','PA','US',40.55951,-79.95867,21552),
(5178195,'Altoona','PA','US',40.51868,-78.39474,45344),
(5178800,'Back Mountain','PA','US',41.33591,-75.99631,26973),
(5180199,'Bethel Park','PA','US',40.32757,-80.0395,32118),
(5180225,'Bethlehem','PA','US',40.62593,-75.37046,74892),
(5188140,'Easton','PA','US',40.68843,-75.22073,26915),
(5188843,'Erie','PA','US',42.12922,-80.08506,99475),
(5192726,'Harrisburg','PA','US',40.2737,-76.88442,49081),
(5193011,'Hazleton','PA','US',40.95842,-75.97465,24825),
(5197079,'Lancaster','PA','US',40.03788,-76.30551,59339),
(5197517,'Lebanon','PA','US',40.34093,-76.41135,25534),
(5197796,'Levittown','PA','US',40.15511,-74.82877,52983),
(5201734,'Monroeville','PA','US',40.42118,-79.7881,28176),
(5202215,'Mount Lebanon','PA','US',40.35535,-80.0495,32730),
(5202765,'Murrysville','PA','US',40.4284,-79.69755,20134),
(5203127,'New Castle','PA','US',41.00367,-80.34701,22375),
(5203506,'Norristown','PA','US',40.1215,-75.3399,34412),
(5205377,'Penn Hills','PA','US',40.50118,-79.83922,44610),
(5206379,'Pittsburgh','PA','US',40.44062,-79.99589,304391),
(5206606,'Plum','PA','US',40.50035,-79.74949,27505),
(5207069,'Pottstown','PA','US',40.24537,-75.64963,22664),
(5207490,'Radnor','PA','US',40.04622,-75.35991,30878),
(5207728,'Reading','PA','US',40.33565,-75.92687,87879),
(5211303,'Scranton','PA','US',41.40916,-75.6649,77118),
(5213681,'State College','PA','US',40.79339,-77.86,42161),
(5218270,'Wayne','PA','US',40.044,-75.38769,30892),
(5218802,'West Mifflin','PA','US',40.3634,-79.86644,20075),
(5219287,'Whitehall Township','PA','US',40.66676,-75.49991,24896),
(5219488,'Wilkes-Barre','PA','US',41.24591,-75.88131,40780),
(5219585,'Williamsport','PA','US',41.24119,-77.00108,29201),
(5221077,'Bristol','RI','US',41.67705,-71.26616,22795),
(5221637,'Coventry','RI','US',41.7001,-71.68284,35525),
(5221659,'Cranston','RI','US',41.77982,-71.43728,81073),
(5221703,'Cumberland','RI','US',41.96677,-71.43284,34843),
(5221931,'East Providence','RI','US',41.81371,-71.37005,47408),
(5223593,'Newport','RI','US',41.4901,-71.31283,24232),
(5223672,'North Kingstown','RI','US',41.5501,-71.46617,28042),
(5223681,'North Providence','RI','US',41.8501,-71.46617,33835),
(5223869,'Pawtucket','RI','US',41.87871,-71.38256,71591),
(5224151,'Providence','RI','US',41.82399,-71.41283,179207),
(5224949,'Smithfield','RI','US',41.92204,-71.54951,21872),
(5225507,'Warwick','RI','US',41.7001,-71.41617,81699),
(5225627,'West Warwick','RI','US',41.69689,-71.52194,30146),
(5225809,'Woonsocket','RI','US',42.00288,-71.51478,41475),
(5225857,'Aberdeen','SD','US',45.4647,-98.48648,28102),
(5226534,'Brookings','SD','US',44.31136,-96.79839,23657),
(5231851,'Sioux Falls','SD','US',43.54997,-96.70033,171544),
(5232741,'Watertown','SD','US',44.89941,-97.11507,22073),
(5234372,'Burlington','VT','US',44.47588,-73.21207,42452),
(5244080,'Appleton','WI','US',44.26193,-88.41538,74139),
(5245387,'Beloit','WI','US',42.50835,-89.03178,36891),
(5246835,'Brookfield','WI','US',43.06057,-88.10648,38025),
(5247415,'Caledonia','WI','US',42.8078,-87.92425,24684),
(5250201,'De Pere','WI','US',44.44888,-88.06038,24724),
(5251436,'Eau Claire','WI','US',44.81135,-91.49849,67778),
(5253219,'Fitchburg','WI','US',42.96083,-89.46984,27996),
(5253352,'Fond du Lac','WI','US',43.775,-88.43883,42933),
(5253710,'Franklin','WI','US',42.88863,-88.03842,36222),
(5254962,'Green Bay','WI','US',44.51916,-88.01983,105207),
(5255068,'Greenfield','WI','US',42.9614,-88.01259,37349),
(5257754,'Janesville','WI','US',42.68279,-89.01872,64123),
(5258393,'Kenosha','WI','US',42.58474,-87.82119,99858),
(5258957,'La Crosse','WI','US',43.80136,-91.23958,52306),
(5261457,'Madison','WI','US',43.07305,-89.40123,248951),
(5261585,'Manitowoc','WI','US',44.08861,-87.65758,33010),
(5262630,'Menomonee Falls','WI','US',43.1789,-88.11731,36119),
(5262649,'Mequon','WI','US',43.21555,-88.03001,23132),
(5263045,'Milwaukee','WI','US',43.0389,-87.90647,600155),
(5264049,'Muskego','WI','US',42.90585,-88.13898,24755),
(5264223,'Neenah','WI','US',44.18582,-88.46261,25792),
(5264381,'New Berlin','WI','US',42.9764,-88.10842,39825),
(5264870,'North La Crosse','WI','US',43.84635,-91.24819,50470),
(5265228,'Oak Creek','WI','US',42.88585,-87.86314,35243),
(5265838,'Oshkosh','WI','US',44.02471,-88.54261,66555),
(5267403,'Pleasant Prairie','WI','US',42.55308,-87.93341,20726),
(5268249,'Racine','WI','US',42.72613,-87.78285,77742),
(5272893,'Sheboygan','WI','US',43.75083,-87.71453,48797),
(5273812,'South Milwaukee','WI','US',42.91057,-87.86064,21233),
(5274644,'Stevens Point','WI','US',44.52358,-89.57456,26604),
(5275020,'Sun Prairie','WI','US',43.1836,-89.21373,32365),
(5275191,'Superior','WI','US',46.72077,-92.10408,26579),
(5278005,'Watertown','WI','US',43.19472,-88.72899,23819),
(5278052,'Waukesha','WI','US',43.01168,-88.23148,71970),
(5278120,'Wausau','WI','US',44.95914,-89.63012,39094),
(5278159,'Wauwatosa','WI','US',43.04946,-88.00759,47614),
(5278420,'West Allis','WI','US',43.01668,-88.00703,60620),
(5278422,'West Bend','WI','US',43.42528,-88.18343,31695),
(5280854,'Wheeling','WV','US',40.06396,-80.72091,27648),
(5282804,'Bridgeport','CT','US',41.17923,-73.18945,147629),
(5282835,'Bristol','CT','US',41.67176,-72.94927,60452),
(5283054,'Branford','CT','US',41.27954,-72.8151,29438),
(5283837,'Cheshire','CT','US',41.49899,-72.90066,29443),
(5287262,'Buckeye','AZ','US',33.37032,-112.58378,50876),
(5287565,'Bullhead City','AZ','US',35.14778,-114.5683,39445),
(5288636,'Casa Grande','AZ','US',32.8795,-111.75735,51460),
(5288661,'Casas Adobes','AZ','US',32.32341,-110.9951,66795),
(5288786,'Catalina Foothills','AZ','US',32.29785,-110.9187,50796),
(5289282,'Chandler','AZ','US',33.30616,-111.84125,260828),
(5292387,'Deer Valley','AZ','US',33.68393,-112.13488,165656),
(5293183,'Drexel Heights','AZ','US',32.14119,-111.02843,27749),
(5293996,'El Mirage','AZ','US',33.61309,-112.3246,33935),
(5294810,'Flagstaff','AZ','US',35.19807,-111.65127,70320),
(5294902,'Florence','AZ','US',33.03145,-111.38734,31110),
(5295143,'Fortuna Foothills','AZ','US',32.65783,-114.41189,26265),
(5295177,'Fountain Hills','AZ','US',33.61171,-111.71736,23899),
(5295903,'Gilbert','AZ','US',33.35283,-111.78903,247542),
(5295985,'Glendale','AZ','US',33.53865,-112.18599,240126),
(5296266,'Goodyear','AZ','US',33.43532,-112.35821,79003),
(5296802,'Green Valley','AZ','US',31.85425,-110.9937,21391),
(5301067,'Kingman','AZ','US',35.18944,-114.05301,28912),
(5301388,'Lake Havasu City','AZ','US',34.4839,-114.32245,53553),
(5303705,'Marana','AZ','US',32.43674,-111.22538,41315),
(5303752,'Maricopa','AZ','US',33.05811,-112.04764,48602),
(5303929,'Maryvale','AZ','US',33.50199,-112.17765,208189),
(5304391,'Mesa','AZ','US',33.42227,-111.82264,471825),
(5306611,'Nogales','AZ','US',31.34038,-110.93425,20252),
(5307540,'Oro Valley','AZ','US',32.39091,-110.96649,43565),
(5308480,'Peoria','AZ','US',33.5806,-112.23738,171237),
(5308655,'Phoenix','AZ','US',33.44838,-112.07404,1563025),
(5309842,'Prescott','AZ','US',34.54002,-112.4685,41899),
(5309858,'Prescott Valley','AZ','US',34.61002,-112.31572,42197),
(5310193,'Queen Creek','AZ','US',33.24866,-111.6343,34614),
(5312544,'Sahuarita','AZ','US',31.95758,-110.95565,25707),
(5312913,'San Luis','AZ','US',32.487,-114.78218,31520),
(5313457,'Scottsdale','AZ','US',33.50921,-111.89903,236839),
(5314328,'Sierra Vista','AZ','US',31.55454,-110.30369,43355),
(5316201,'Sun City','AZ','US',33.59754,-112.27182,37499),
(5316205,'Sun City West','AZ','US',33.66198,-112.34127,24535),
(5316428,'Surprise','AZ','US',33.63059,-112.33322,128422),
(5317058,'Tempe','AZ','US',33.41477,-111.90931,175826),
(5317071,'Tempe Junction','AZ','US',33.41421,-111.94348,158368),
(5318313,'Tucson','AZ','US',32.22174,-110.92648,531641),
(5322053,'Yuma','AZ','US',32.72532,-114.6244,94139),
(5322400,'Adelanto','CA','US',34.58277,-117.40922,33166),
(5322551,'Agoura','CA','US',34.14306,-118.73787,20537),
(5322553,'Agoura Hills','CA','US',34.13639,-118.77453,20915),
(5322737,'Alameda','CA','US',37.77099,-122.26087,78630),
(5323060,'Alhambra','CA','US',34.09529,-118.12701,85551),
(5323163,'Aliso Viejo','CA','US',33.56504,-117.72712,50195),
(5323525,'Altadena','CA','US',34.18973,-118.13118,42777),
(5323694,'American Canyon','CA','US',38.17492,-122.2608,20554),
(5323810,'Anaheim','CA','US',33.83529,-117.9145,350742),
(5324105,'Antelope','CA','US',38.70824,-121.32995,45770),
(5324200,'Antioch','CA','US',38.00492,-121.80579,110542),
(5324363,'Apple Valley','CA','US',34.50083,-117.18588,72174),
(5324477,'Arcadia','CA','US',34.13973,-118.03534,58408),
(5324903,'Arvin','CA','US',35.20913,-118.82843,20876),
(5325011,'Ashland','CA','US',37.69465,-122.11385,21925),
(5325111,'Atascadero','CA','US',35.48942,-120.67073,29819),
(5325187,'Atwater','CA','US',37.34772,-120.60908,29237),
(5325423,'Azusa','CA','US',34.13362,-117.90756,49690),
(5325738,'Bakersfield','CA','US',35.37329,-119.01871,373640),
(5325866,'Baldwin Park','CA','US',34.08529,-117.9609,77071),
(5326032,'Banning','CA','US',33.92557,-116.87641,30945),
(5326297,'Barstow','CA','US',34.89859,-117.02282,23692),
(5326305,'Barstow Heights','CA','US',34.86971,-117.05615,24202),
(5326561,'Bay Point','CA','US',38.02909,-121.96163,21534),
(5327098,'Beaumont','CA','US',33.92946,-116.97725,43811),
(5327298,'Bell','CA','US',33.97751,-118.18702,36205),
(5327319,'Bell Gardens','CA','US',33.96529,-118.15146,43106),
(5327422,'Bellflower','CA','US',33.88168,-118.11701,78441),
(5327455,'Belmont','CA','US',37.52021,-122.2758,27218),
(5327550,'Benicia','CA','US',38.04937,-122.15858,28167),
(5327684,'Berkeley','CA','US',37.87159,-122.27275,120972),
(5328041,'Beverly Hills','CA','US',34.07362,-118.40036,34869),
(5329408,'Bloomington','CA','US',34.07029,-117.39588,23851),
(5330413,'Boyle Heights','CA','US',34.0339,-118.20535,92785),
(5330567,'Brawley','CA','US',32.97866,-115.53027,25897),
(5330582,'Brea','CA','US',33.91668,-117.90006,41944),
(5330642,'Brentwood','CA','US',37.93187,-121.69579,58968),
(5331575,'Buena Park','CA','US',33.86751,-117.99812,83270),
(5331835,'Burbank','CA','US',34.18084,-118.30897,105319),
(5331920,'Burlingame','CA','US',37.5841,-122.36608,30459),
(5332593,'Calabasas','CA','US',34.15778,-118.63842,23058),
(5332698,'Calexico','CA','US',32.67895,-115.49888,40053),
(5333180,'Camarillo','CA','US',34.21639,-119.0376,67608),
(5333689,'Campbell','CA','US',37.28717,-121.94996,41117),
(5333913,'Canoga Park','CA','US',34.20112,-118.59814,60578),
(5334223,'Carlsbad','CA','US',33.15809,-117.35059,113453),
(5334336,'Carmichael','CA','US',38.61713,-121.32828,61762),
(5334519,'Carson','CA','US',33.83141,-118.28202,93281),
(5334928,'Castro Valley','CA','US',37.6941,-122.08635,61388),
(5335006,'Cathedral City','CA','US',33.77974,-116.46529,53826),
(5335650,'Ceres','CA','US',37.59493,-120.95771,47963),
(5335663,'Cerritos','CA','US',33.85835,-118.06479,49975),
(5336054,'Chatsworth','CA','US',34.25723,-118.6012,41255),
(5336269,'Chico','CA','US',39.72849,-121.83748,90316),
(5336477,'Chinatown','CA','US',37.7966,-122.40858,100574),
(5336537,'Chino','CA','US',34.01223,-117.68894,85595),
(5336545,'Chino Hills','CA','US',33.9938,-117.75888,78309),
(5336899,'Chula Vista','CA','US',32.64005,-117.0842,265757),
(5337561,'Citrus Heights','CA','US',38.70712,-121.28106,87056),
(5337696,'Claremont','CA','US',34.09668,-117.71978,36283),
(5338122,'Clovis','CA','US',36.82523,-119.70292,104180),
(5338166,'Coachella','CA','US',33.6803,-116.17389,44635),
(5338783,'Colton','CA','US',34.0739,-117.31365,54621),
(5339066,'Compton','CA','US',33.89585,-118.22007,98462),
(5339111,'Concord','CA','US',37.97798,-122.03107,128667),
(5339539,'Corcoran','CA','US',36.09801,-119.5604,22477),
(5339631,'Corona','CA','US',33.87529,-117.56644,164226),
(5339663,'Coronado','CA','US',32.68589,-117.18309,24812),
(5339840,'Costa Mesa','CA','US',33.64113,-117.91867,113204),
(5340175,'Covina','CA','US',34.09001,-117.89034,48984),
(5341051,'Cudahy','CA','US',33.96057,-118.18535,24311),
(5341114,'Culver City','CA','US',34.02112,-118.39647,39717),
(5341145,'Cupertino','CA','US',37.323,-122.03218,60572),
(5341256,'Cypress','CA','US',33.81696,-118.03729,49290),
(5341430,'Daly City','CA','US',37.70577,-122.46192,106562),
(5341483,'Dana Point','CA','US',33.46697,-117.69811,34181),
(5341531,'Danville','CA','US',37.82159,-121.99996,44400),
(5341704,'Davis','CA','US',38.54491,-121.74052,67666),
(5342485,'Delano','CA','US',35.76884,-119.24705,52733),
(5342710,'Desert Hot Springs','CA','US',33.96173,-116.50353,28335),
(5342992,'Diamond Bar','CA','US',34.02862,-117.81034,56897),
(5343171,'Dinuba','CA','US',36.54328,-119.38707,23702),
(5343858,'Downey','CA','US',33.94001,-118.13257,114219),
(5344147,'Duarte','CA','US',34.13945,-117.97729,21990),
(5344157,'Dublin','CA','US',37.70215,-121.93579,57721),
(5344994,'East Los Angeles','CA','US',34.0239,-118.17202,126496),
(5345032,'East Palo Alto','CA','US',37.46883,-122.14108,29662),
(5345529,'El Cajon','CA','US',32.79477,-116.96253,103679),
(5345609,'El Centro','CA','US',32.792,-115.56305,43956),
(5345623,'El Cerrito','CA','US',37.91576,-122.31164,23549),
(5345679,'El Dorado Hills','CA','US',38.68574,-121.08217,42108),
(5345743,'El Monte','CA','US',34.06862,-118.02757,116732),
(5346111,'Elk Grove','CA','US',38.4088,-121.37162,166913),
(5346646,'Encinitas','CA','US',33.03699,-117.29198,62930),
(5346649,'Encino','CA','US',34.15917,-118.50119,44581),
(5346827,'Escondido','CA','US',33.11921,-117.08642,151451),
(5347287,'Fair Oaks','CA','US',38.64463,-121.27217,30912),
(5347335,'Fairfield','CA','US',38.24936,-122.03997,112970),
(5347578,'Fallbrook','CA','US',33.37642,-117.25115,30534),
(5349613,'Florin','CA','US',38.49602,-121.40884,47513),
(5349705,'Folsom','CA','US',38.67796,-121.17606,76375),
(5349755,'Fontana','CA','US',34.09223,-117.43505,207460),
(5349803,'Foothill Farms','CA','US',38.67877,-121.35114,33121),
(5350159,'Foster City','CA','US',37.55855,-122.27108,33477),
(5350207,'Fountain Valley','CA','US',33.70918,-117.95367,56987),
(5350734,'Fremont','CA','US',37.54827,-121.98857,232206),
(5350937,'Fresno','CA','US',36.74773,-119.77237,520052),
(5351247,'Fullerton','CA','US',33.87029,-117.92534,140847),
(5351428,'Galt','CA','US',38.25464,-121.29995,25303),
(5351515,'Garden Grove','CA','US',33.77391,-117.94145,175393),
(5351549,'Gardena','CA','US',33.88835,-118.30896,60447),
(5352214,'Gilroy','CA','US',37.00578,-121.56828,53231),
(5352350,'Glen Avon','CA','US',34.01168,-117.48477,20199),
(5352423,'Glendale','CA','US',34.14251,-118.25508,201020),
(5352439,'Glendora','CA','US',34.13612,-117.86534,52009),
(5352963,'Goleta','CA','US',34.43583,-119.82764,30944),
(5353530,'Granite Bay','CA','US',38.76323,-121.16384,20402),
(5354819,'Hacienda Heights','CA','US',33.99307,-117.96868,54038),
(5355180,'Hanford','CA','US',36.32745,-119.64568,55659),
(5355828,'Hawthorne','CA','US',33.9164,-118.35257,88451),
(5355933,'Hayward','CA','US',37.66882,-122.0808,158289),
(5356277,'Hemet','CA','US',33.74761,-116.97307,83861),
(5356451,'Hercules','CA','US',38.01714,-122.28858,25314),
(5356576,'Hesperia','CA','US',34.42639,-117.30088,93295),
(5356868,'Highland','CA','US',34.12834,-117.20865,54854),
(5357499,'Hollister','CA','US',36.85245,-121.4016,37462),
(5357527,'Hollywood','CA','US',34.09834,-118.32674,167664),
(5358705,'Huntington Beach','CA','US',33.6603,-117.99923,201899),
(5358736,'Huntington Park','CA','US',33.98168,-118.22507,59430),
(5359054,'Imperial Beach','CA','US',32.58394,-117.11308,27408),
(5359446,'Indio','CA','US',33.7207,-116.21677,87533),
(5359488,'Inglewood','CA','US',33.96168,-118.35313,111666),
(5359777,'Irvine','CA','US',33.66946,-117.82311,256927),
(5359864,'Isla Vista','CA','US',34.41333,-119.86097,23096),
(5363748,'Koreatown','CA','US',34.05779,-118.30091,124281),
(5363859,'La Cañada Flintridge','CA','US',34.19917,-118.18785,20246),
(5363922,'La Habra','CA','US',33.93196,-117.94617,62131),
(5363943,'La Jolla','CA','US',32.84727,-117.2742,42808),
(5363990,'La Mesa','CA','US',32.76783,-117.02308,60089),
(5364007,'La Mirada','CA','US',33.91724,-118.01201,49520),
(5364059,'La Presa','CA','US',32.70811,-116.99725,34169),
(5364066,'La Puente','CA','US',34.02001,-117.94951,40745),
(5364079,'La Quinta','CA','US',33.66336,-116.31001,40476),
(5364134,'La Verne','CA','US',34.10084,-117.76784,32681),
(5364199,'Ladera Ranch','CA','US',33.57086,-117.63561,22980),
(5364226,'Lafayette','CA','US',37.88576,-122.11802,25843),
(5364271,'Laguna','CA','US',38.42102,-121.42384,46621),
(5364275,'Laguna Beach','CA','US',33.54225,-117.78311,23365),
(5364306,'Laguna Hills','CA','US',33.61252,-117.71283,31748),
(5364329,'Laguna Niguel','CA','US',33.52253,-117.70755,65806),
(5364499,'Lake Elsinore','CA','US',33.66808,-117.32726,61981),
(5364514,'Lake Forest','CA','US',33.64697,-117.68922,82492),
(5364782,'Lakeside','CA','US',32.85727,-116.92225,20648),
(5364855,'Lakewood','CA','US',33.85363,-118.13396,81611),
(5364940,'Lancaster','CA','US',34.69804,-118.13674,161103),
(5365425,'Lathrop','CA','US',37.8227,-121.27661,20866),
(5365603,'Lawndale','CA','US',33.88724,-118.35257,33430),
(5365893,'Lemon Grove','CA','US',32.74255,-117.03142,26709),
(5365918,'Lemoore','CA','US',36.30078,-119.78291,25647),
(5365937,'Lennox','CA','US',33.93807,-118.35258,22753),
(5366375,'Lincoln','CA','US',38.89156,-121.29301,46474),
(5367440,'Livermore','CA','US',37.68187,-121.76801,88126),
(5367565,'Lodi','CA','US',38.1302,-121.27245,64596),
(5367696,'Loma Linda','CA','US',34.04835,-117.26115,24045),
(5367767,'Lomita','CA','US',33.79224,-118.31507,20785),
(5367788,'Lompoc','CA','US',34.63915,-120.45794,44164),
(5367929,'Long Beach','CA','US',33.76696,-118.18923,474140),
(5368335,'Los Altos','CA','US',37.38522,-122.11413,30671),
(5368361,'Los Angeles','CA','US',34.05223,-118.24368,3971883),
(5368453,'Los Banos','CA','US',37.05828,-120.84992,37457),
(5368518,'Los Gatos','CA','US',37.22661,-121.97468,30705),
(5369367,'Lynwood','CA','US',33.93029,-118.21146,71989),
(5369568,'Madera','CA','US',36.96134,-120.06072,64208),
(5370082,'Manhattan Beach','CA','US',33.88474,-118.41091,35818),
(5370164,'Manteca','CA','US',37.79743,-121.21605,75448),
(5370493,'Marina','CA','US',36.6844,-121.80217,21229),
(5370868,'Martinez','CA','US',38.01937,-122.13413,38137),
(5371261,'Maywood','CA','US',33.98668,-118.18535,27888),
(5372205,'Menifee','CA','US',33.72835,-117.14642,87174),
(5372223,'Menlo Park','CA','US',37.45383,-122.18219,33449),
(5372253,'Merced','CA','US',37.30216,-120.48297,82436),
(5373129,'Millbrae','CA','US',37.59855,-122.38719,22795),
(5373327,'Milpitas','CA','US',37.42827,-121.90662,77604),
(5373492,'Jurupa Valley','CA','US',33.99251,-117.51644,21930),
(5373497,'Mira Mesa','CA','US',32.9156,-117.14392,70000),
(5373628,'Mission District','CA','US',37.75993,-122.41914,47234),
(5373763,'Mission Viejo','CA','US',33.60002,-117.672,97156),
(5373900,'Modesto','CA','US',37.6391,-120.99688,211266),
(5374175,'Monrovia','CA','US',34.14806,-117.99895,37463),
(5374232,'Montclair','CA','US',34.07751,-117.68978,38690),
(5374322,'Montebello','CA','US',34.00946,-118.10535,63921),
(5374361,'Monterey','CA','US',36.60024,-121.89468,28338),
(5374406,'Monterey Park','CA','US',34.06251,-118.12285,61468),
(5374648,'Moorpark','CA','US',34.28556,-118.88204,36104),
(5374732,'Moreno Valley','CA','US',33.93752,-117.23059,204198),
(5374764,'Morgan Hill','CA','US',37.1305,-121.65439,42948),
(5375480,'Mountain View','CA','US',37.38605,-122.08385,80435),
(5375911,'Murrieta','CA','US',33.55391,-117.21392,109830),
(5376095,'Napa','CA','US',38.29714,-122.28553,80434),
(5376200,'National City','CA','US',32.67811,-117.0992,61060),
(5376803,'Newark','CA','US',37.52966,-122.04024,45336),
(5376890,'Newport Beach','CA','US',33.61891,-117.92895,87127),
(5377199,'Norco','CA','US',33.93113,-117.54866,26289),
(5377640,'North Highlands','CA','US',38.68574,-121.37217,42694),
(5377654,'North Hollywood','CA','US',34.17223,-118.37897,77848),
(5377985,'Northridge','CA','US',34.22834,-118.53675,68469),
(5377995,'Norwalk','CA','US',33.90224,-118.08173,107140),
(5378044,'Novato','CA','US',38.10742,-122.5697,55530),
(5378500,'Oakdale','CA','US',37.76659,-120.84715,22259),
(5378538,'Oakland','CA','US',37.80437,-122.2708,419267),
(5378566,'Oakley','CA','US',37.99742,-121.71245,39813),
(5378771,'Oceanside','CA','US',33.19587,-117.37948,175691),
(5378870,'Oildale','CA','US',35.41968,-119.01955,32684),
(5379439,'Ontario','CA','US',34.06334,-117.65089,171214),
(5379513,'Orange','CA','US',33.78779,-117.85311,140992),
(5379566,'Orangevale','CA','US',38.67851,-121.22578,33960),
(5379609,'Orcutt','CA','US',34.86526,-120.436,28905),
(5380184,'Oxnard','CA','US',34.1975,-119.17705,207254),
(5380420,'Pacifica','CA','US',37.61383,-122.48692,39260),
(5380626,'Palm Desert','CA','US',33.72255,-116.37697,51869),
(5380668,'Palm Springs','CA','US',33.8303,-116.54529,47371),
(5380698,'Palmdale','CA','US',34.57943,-118.11646,158351),
(5380748,'Palo Alto','CA','US',37.44188,-122.14302,66853),
(5381002,'Paradise','CA','US',39.75961,-121.62192,26476),
(5381110,'Paramount','CA','US',33.88946,-118.15979,55412),
(5381396,'Pasadena','CA','US',34.14778,-118.14452,142250),
(5381438,'Paso Robles','CA','US',35.62664,-120.691,27157),
(5381515,'Patterson','CA','US',37.4716,-121.12966,21498),
(5382146,'Perris','CA','US',33.78252,-117.22865,74971),
(5382232,'Petaluma','CA','US',38.23242,-122.63665,60438),
(5382496,'Pico Rivera','CA','US',33.98307,-118.09673,64218),
(5383465,'Pittsburg','CA','US',38.02798,-121.88468,69424),
(5383527,'Placentia','CA','US',33.87224,-117.87034,52495),
(5383720,'Pleasant Hill','CA','US',37.94798,-122.0608,34810),
(5383777,'Pleasanton','CA','US',37.66243,-121.87468,79510),
(5384170,'Pomona','CA','US',34.05529,-117.75228,153266),
(5384339,'Port Hueneme','CA','US',34.14778,-119.19511,22423),
(5384471,'Porterville','CA','US',36.06523,-119.01677,56058),
(5384690,'Poway','CA','US',32.96282,-117.03586,50157),
(5385793,'Ramona','CA','US',33.04171,-116.86808,20292),
(5385941,'Rancho Cordova','CA','US',38.58907,-121.30273,71017),
(5385955,'Rancho Cucamonga','CA','US',34.1064,-117.59311,175236),
(5386035,'Rancho Palos Verdes','CA','US',33.74446,-118.38702,42732),
(5386039,'Rancho Penasquitos','CA','US',32.95949,-117.11531,60000),
(5386053,'Rancho San Diego','CA','US',32.74727,-116.9353,21208),
(5386082,'Rancho Santa Margarita','CA','US',33.64086,-117.6031,49324),
(5386754,'Redlands','CA','US',34.05557,-117.18254,71035),
(5386785,'Redondo Beach','CA','US',33.84918,-118.38841,68166),
(5386834,'Redwood City','CA','US',37.48522,-122.23635,85288),
(5386984,'Reedley','CA','US',36.59634,-119.4504,25569),
(5387288,'Rialto','CA','US',34.1064,-117.37032,103132),
(5387428,'Richmond','CA','US',37.93576,-122.34775,109708),
(5387494,'Ridgecrest','CA','US',35.62246,-117.6709,28780),
(5387844,'Riverbank','CA','US',37.73604,-120.93549,24122),
(5387877,'Riverside','CA','US',33.95335,-117.39616,322424),
(5388319,'Rocklin','CA','US',38.79073,-121.23578,61213),
(5388564,'Rohnert Park','CA','US',38.33964,-122.7011,42407),
(5388867,'Rosemead','CA','US',34.08057,-118.07285,54908),
(5388873,'Rosemont','CA','US',38.55185,-121.36467,22681),
(5388881,'Roseville','CA','US',38.75212,-121.28801,130269),
(5389126,'Rowland Heights','CA','US',33.97612,-117.90534,48993),
(5389213,'Rubidoux','CA','US',33.99613,-117.4056,34280),
(5389489,'Sacramento','CA','US',38.58157,-121.4944,490712),
(5391295,'Salinas','CA','US',36.67774,-121.6555,157380),
(5391710,'San Bernardino','CA','US',34.10834,-117.28977,216108),
(5391749,'San Bruno','CA','US',37.63049,-122.41108,43185),
(5391760,'San Carlos','CA','US',37.50716,-122.26052,29931),
(5391791,'San Clemente','CA','US',33.42697,-117.61199,65526),
(5391811,'San Diego','CA','US',32.71571,-117.16472,1394928),
(5391891,'San Dimas','CA','US',34.10668,-117.80673,34630),
(5391945,'San Fernando','CA','US',34.28195,-118.43897,24931),
(5391959,'San Francisco','CA','US',37.77493,-122.41942,864816),
(5392034,'San Gabriel','CA','US',34.09611,-118.10583,40424),
(5392090,'San Jacinto','CA','US',33.78391,-116.95864,46951),
(5392171,'San Jose','CA','US',37.33939,-121.89496,1026908),
(5392229,'San Juan Capistrano','CA','US',33.50169,-117.66255,36454),
(5392263,'San Leandro','CA','US',37.72493,-122.15608,90712),
(5392281,'San Lorenzo','CA','US',37.68104,-122.12441,23452),
(5392323,'San Luis Obispo','CA','US',35.28275,-120.65962,47339),
(5392368,'San Marcos','CA','US',33.14337,-117.16614,92931),
(5392423,'San Mateo','CA','US',37.56299,-122.32553,103536),
(5392508,'San Pablo','CA','US',37.96215,-122.34553,30407),
(5392528,'San Pedro','CA','US',33.73585,-118.29229,78405),
(5392567,'San Rafael','CA','US',37.97353,-122.53109,59162),
(5392593,'San Ramon','CA','US',37.77993,-121.97802,76134),
(5392868,'Sanger','CA','US',36.70801,-119.55597,24950),
(5392900,'Santa Ana','CA','US',33.74557,-117.86783,335400),
(5392952,'Santa Barbara','CA','US',34.42083,-119.69819,91842),
(5393015,'Santa Clara','CA','US',37.35411,-121.95524,126215),
(5393049,'Santa Clarita','CA','US',34.39166,-118.54259,182371),
(5393052,'Santa Cruz','CA','US',36.97412,-122.0308,64220),
(5393180,'Santa Maria','CA','US',34.95303,-120.43572,105093),
(5393212,'Santa Monica','CA','US',34.01945,-118.49119,93220),
(5393245,'Santa Paula','CA','US',34.35417,-119.05927,30546),
(5393287,'Santa Rosa','CA','US',38.44047,-122.71443,174972),
(5393429,'Santee','CA','US',32.83838,-116.97392,57787),
(5393485,'Saratoga','CA','US',37.26383,-122.02301,30968),
(5394086,'Seal Beach','CA','US',33.74141,-118.10479,24619),
(5394136,'Seaside','CA','US',36.61107,-121.85162,33025),
(5394329,'Selma','CA','US',36.57078,-119.61208,24414),
(5394409,'North Hills','CA','US',34.23639,-118.48472,56946),
(5395244,'Sherman Oaks','CA','US',34.15112,-118.44925,52677),
(5396003,'Simi Valley','CA','US',34.26945,-118.78148,126788),
(5397018,'Soledad','CA','US',36.42469,-121.32632,25003),
(5397376,'South El Monte','CA','US',34.05195,-118.04673,20878),
(5397603,'South Gate','CA','US',33.95474,-118.21202,96401),
(5397664,'South Lake Tahoe','CA','US',38.93324,-119.98435,21706)
on conflict (id) do nothing;
insert into places (id, name, state, country, lat, lng, population) values
(5397717,'South Pasadena','CA','US',34.11612,-118.15035,26151),
(5397765,'South San Francisco','CA','US',37.65466,-122.40775,67271),
(5397777,'South San Jose Hills','CA','US',34.01279,-117.90478,20551),
(5397841,'South Whittier','CA','US',33.95015,-118.03917,57156),
(5398277,'Spring Valley','CA','US',32.74477,-116.99892,28205),
(5398630,'Stanton','CA','US',33.80252,-117.99312,38872),
(5399020,'Stockton','CA','US',37.9577,-121.29078,305658),
(5399438,'Studio City','CA','US',34.14862,-118.39647,34034),
(5399629,'Suisun','CA','US',38.23825,-122.04024,28111),
(5400075,'Sunnyvale','CA','US',37.36883,-122.03635,151754),
(5401395,'Temecula','CA','US',33.49364,-117.14836,112011),
(5401469,'Temple City','CA','US',34.10723,-118.05785,36365),
(5402405,'Thousand Oaks','CA','US',34.17056,-118.83759,129339),
(5403022,'Torrance','CA','US',33.83585,-118.34063,148475),
(5403191,'Tracy','CA','US',37.73987,-121.42618,87075),
(5403767,'Tujunga','CA','US',34.25223,-118.28841,26527),
(5403783,'Tulare','CA','US',36.20773,-119.34734,62315),
(5404024,'Turlock','CA','US',37.49466,-120.84659,72292),
(5404119,'Tustin','CA','US',33.74585,-117.82617,80583),
(5404122,'North Tustin','CA','US',33.76446,-117.79394,24917),
(5404198,'Twentynine Palms','CA','US',34.13556,-116.05417,26025),
(5404555,'Union City','CA','US',37.59577,-122.01913,74494),
(5404794,'Universal City','CA','US',34.1389,-118.35341,105000),
(5404915,'Upland','CA','US',34.09751,-117.64839,76443),
(5405228,'Vacaville','CA','US',38.35658,-121.98774,96803),
(5405288,'Valencia','CA','US',34.44361,-118.60953,148456),
(5405326,'Valinda','CA','US',34.04529,-117.94367,22822),
(5405380,'Vallejo','CA','US',38.10409,-122.25664,121253),
(5405693,'Van Nuys','CA','US',34.18667,-118.44897,136443),
(5405841,'Venice','CA','US',33.99084,-118.46008,40885),
(5405878,'Ventura','CA','US',34.27834,-119.29317,96769),
(5406222,'Victorville','CA','US',34.53611,-117.29116,122225),
(5406567,'Visalia','CA','US',36.33023,-119.29206,130104),
(5406602,'Vista','CA','US',33.20004,-117.24254,100890),
(5406976,'Walnut','CA','US',34.02029,-117.86534,30237),
(5406990,'Walnut Creek','CA','US',37.90631,-122.06496,68910),
(5407529,'Watsonville','CA','US',36.91023,-121.75689,53628),
(5407908,'West Carson','CA','US',33.82168,-118.29257,21699),
(5407933,'West Covina','CA','US',34.06862,-117.93895,108484),
(5408076,'West Hollywood','CA','US',34.09001,-118.36174,36222),
(5408191,'West Puente Valley','CA','US',34.05168,-117.9684,22636),
(5408211,'West Sacramento','CA','US',38.58046,-121.53023,52721),
(5408406,'Westminster','CA','US',33.75918,-118.00673,92114),
(5408431,'Westmont','CA','US',33.9414,-118.3023,31853),
(5409059,'Whittier','CA','US',33.97918,-118.03284,87438),
(5409260,'Wildomar','CA','US',33.59891,-117.28004,35632),
(5409768,'Willowbrook','CA','US',33.91696,-118.25507,35983),
(5410004,'Windsor','CA','US',38.54713,-122.81638,27464),
(5410129,'Winter Gardens','CA','US',32.83116,-116.93336,20631),
(5410430,'Woodland','CA','US',38.67852,-121.7733,58567),
(5410438,'Woodland Hills','CA','US',34.16834,-118.60592,70000),
(5410902,'Yorba Linda','CA','US',33.88863,-117.81311,67973),
(5411015,'Yuba City','CA','US',39.14045,-121.61691,66941),
(5411046,'Yucaipa','CA','US',34.03363,-117.04309,53328),
(5411079,'Yucca Valley','CA','US',34.11417,-116.43224,21600),
(5412199,'Arvada','CO','US',39.80276,-105.08748,115368),
(5412347,'Aurora','CO','US',39.72943,-104.83192,359407),
(5414941,'Brighton','CO','US',39.98526,-104.82053,37585),
(5415035,'Broomfield','CO','US',39.92054,-105.08665,65065),
(5416329,'Castle Rock','CO','US',39.37221,-104.85609,55591),
(5416357,'Castlewood','CO','US',39.58471,-104.90109,25271),
(5416541,'Centennial','CO','US',39.57916,-104.87692,109741),
(5417598,'Colorado Springs','CO','US',38.83388,-104.82136,456568),
(5417657,'Columbine','CO','US',39.58777,-105.06943,24280),
(5417737,'Commerce City','CO','US',39.80832,-104.93387,53696),
(5419384,'Denver','CO','US',39.73915,-104.9847,682545),
(5421250,'Englewood','CO','US',39.64777,-104.98776,33082),
(5422191,'Fountain','CO','US',38.68222,-104.70081,27767),
(5423294,'Golden','CO','US',39.75554,-105.2211,20330),
(5423573,'Grand Junction','CO','US',39.06387,-108.55065,60358),
(5425043,'Highlands Ranch','CO','US',39.55388,-104.96943,96713),
(5427207,'Ken Caryl','CO','US',39.57582,-105.11221,32438),
(5427771,'Lafayette','CO','US',39.9936,-105.08971,27729),
(5427946,'Lakewood','CO','US',39.70471,-105.08137,152597),
(5429032,'Littleton','CO','US',39.61332,-105.01665,46368),
(5429522,'Louisville','CO','US',39.97776,-105.13193,20396),
(5433124,'Northglenn','CO','US',39.88554,-104.9872,39197),
(5434006,'Parker','CO','US',39.5186,-104.76136,49550),
(5435464,'Pueblo','CO','US',38.25445,-104.60914,109412),
(5435477,'Pueblo West','CO','US',38.35,-104.72275,29637),
(5439752,'Southglenn','CO','US',39.58721,-104.95276,42268),
(5441492,'Thornton','CO','US',39.86804,-104.97192,133451),
(5443910,'Westminster','CO','US',39.83665,-105.0372,113130),
(5443948,'Wheat Ridge','CO','US',39.7661,-105.07721,31192),
(5445298,'Dodge City','KS','US',37.7528,-100.01708,27912),
(5445439,'Garden City','KS','US',37.97169,-100.87266,27005),
(5445820,'Liberal','KS','US',37.04308,-100.921,20746),
(5454627,'Alamogordo','NM','US',32.89953,-105.96027,30753),
(5454711,'Albuquerque','NM','US',35.08449,-106.65114,559121),
(5460459,'Carlsbad','NM','US',32.42067,-104.22884,28957),
(5462393,'Clovis','NM','US',34.4048,-103.20523,39480),
(5467328,'Farmington','NM','US',36.72806,-108.21869,42871),
(5468773,'Gallup','NM','US',35.52808,-108.74258,23240),
(5471578,'Hobbs','NM','US',32.70261,-103.13604,38416),
(5475352,'Las Cruces','NM','US',32.31232,-106.77834,101643),
(5487811,'Rio Rancho','NM','US',35.23338,-106.66447,87521),
(5488441,'Roswell','NM','US',33.39437,-104.52491,48544),
(5490263,'Santa Fe','NM','US',35.68698,-105.9378,84099),
(5492450,'South Valley','NM','US',35.01005,-106.67808,40976),
(5501344,'Carson City','NV','US',39.1638,-119.7674,54521),
(5503766,'Enterprise','NV','US',36.02525,-115.24194,108481),
(5505411,'Henderson','NV','US',36.0397,-114.98194,285667),
(5506956,'Las Vegas','NV','US',36.17497,-115.13722,623747),
(5509403,'North Las Vegas','NV','US',36.19886,-115.1175,234807),
(5509851,'Pahrump','NV','US',36.20829,-115.98391,36441),
(5509952,'Paradise','NV','US',36.09719,-115.14666,223167),
(5511077,'Reno','NV','US',39.52963,-119.8138,241445),
(5512862,'Sparks','NV','US',39.53491,-119.75269,96094),
(5512909,'Spring Valley','NV','US',36.10803,-115.245,178395),
(5513343,'Sunrise Manor','NV','US',36.21108,-115.07306,189372),
(5515110,'Whitney','NV','US',36.09831,-115.0363,38585),
(5515345,'Winchester','NV','US',36.12997,-115.11889,27978),
(5516233,'Amarillo','TX','US',35.222,-101.8313,198645),
(5517061,'Big Spring','TX','US',32.2504,-101.47874,28862),
(5520076,'Del Rio','TX','US',29.36273,-100.89676,36153),
(5520677,'Eagle Pass','TX','US',28.70914,-100.49952,28765),
(5520993,'El Paso','TX','US',31.75872,-106.48693,681124),
(5525577,'Lubbock','TX','US',33.57786,-101.85517,249042),
(5526337,'Midland','TX','US',31.99735,-102.07791,132950),
(5527554,'Odessa','TX','US',31.84568,-102.36764,118968),
(5528450,'Plainview','TX','US',34.18479,-101.70684,20919),
(5530022,'San Angelo','TX','US',31.46377,-100.43704,100450),
(5530932,'Socorro','TX','US',31.65456,-106.30331,33222),
(5530937,'Socorro Mission Number 1 Colonia','TX','US',31.63622,-106.29054,28637),
(5533366,'West Odessa','TX','US',31.84235,-102.49876,22707),
(5536630,'Cedar City','UT','US',37.67748,-113.06189,30184),
(5546220,'Saint George','UT','US',37.10415,-113.58412,72897),
(5549222,'Washington','UT','US',37.13054,-113.50829,24299),
(5550368,'Wasco','CA','US',35.59412,-119.34095,26279),
(5551123,'Alhambra','AZ','US',33.49838,-112.13432,127764),
(5551498,'Anthem','AZ','US',33.86726,-112.14682,21700),
(5551535,'Apache Junction','AZ','US',33.41505,-111.54958,38074),
(5552301,'Avondale','AZ','US',33.4356,-112.3496,80684),
(5552450,'Ahwatukee Foothills','AZ','US',33.34171,-111.98403,83464),
(5554072,'Juneau','AK','US',58.30194,-134.41972,32756),
(5563397,'Eureka','CA','US',40.80207,-124.16367,27017),
(5570160,'Redding','CA','US',40.58654,-122.39168,91582),
(5574991,'Boulder','CO','US',40.01499,-105.27055,107349),
(5576859,'Erie','CO','US',40.05026,-105.04998,21420),
(5576909,'Evans','CO','US',40.37637,-104.69219,21383),
(5577147,'Fort Collins','CO','US',40.58526,-105.08442,161175),
(5577592,'Greeley','CO','US',40.42331,-104.70913,100883),
(5579276,'Longmont','CO','US',40.16721,-105.10193,92088),
(5579368,'Loveland','CO','US',40.39776,-105.07498,75182),
(5583509,'Windsor','CO','US',40.47748,-104.90136,21751),
(5586437,'Boise','ID','US',43.6135,-116.20345,145987),
(5587698,'Caldwell','ID','US',43.66294,-116.68736,51686),
(5589173,'Coeur d''Alene','ID','US',47.67768,-116.78047,49122),
(5591778,'Eagle','ID','US',43.69544,-116.35401,23612),
(5596475,'Idaho Falls','ID','US',43.46658,-112.03414,59184),
(5598538,'Lewiston','ID','US',46.41655,-117.01766,32544),
(5598542,'Lewiston Orchards','ID','US',46.38044,-116.97543,31422),
(5600685,'Meridian','ID','US',43.61211,-116.39151,90739),
(5601538,'Moscow','ID','US',46.73239,-117.00017,25060),
(5601933,'Nampa','ID','US',43.54072,-116.56346,89839),
(5604045,'Pocatello','ID','US',42.8713,-112.44553,54441),
(5604353,'Post Falls','ID','US',47.71796,-116.95159,30453),
(5605242,'Rexburg','ID','US',43.82602,-111.78969,27663),
(5610810,'Twin Falls','ID','US',42.56297,-114.46087,47468),
(5640350,'Billings','MT','US',45.78329,-108.50069,110263),
(5641727,'Bozeman','MT','US',45.67965,-111.03856,43405),
(5642934,'Butte','MT','US',46.00382,-112.53474,34190),
(5655240,'Great Falls','MT','US',47.50024,-111.30081,59638),
(5656882,'Helena','MT','US',46.59271,-112.03611,30581),
(5660340,'Kalispell','MT','US',48.19579,-114.31291,22052),
(5666639,'Missoula','MT','US',46.87215,-113.994,71022),
(5688025,'Bismarck','ND','US',46.80833,-100.78374,71167),
(5688789,'Dickinson','ND','US',46.87918,-102.78962,23765),
(5690366,'Mandan','ND','US',46.82666,-100.88958,21382),
(5690532,'Minot','ND','US',48.23251,-101.29627,49450),
(5692947,'Williston','ND','US',48.14697,-103.61797,26977),
(5697939,'North Platte','NE','US',41.12389,-100.76542,24194),
(5703670,'Elko','NV','US',40.83242,-115.76312,20279),
(5710756,'Albany','OR','US',44.63651,-123.10593,52175),
(5711099,'Aloha','OR','US',45.49428,-122.86705,49425),
(5711789,'Ashland','OR','US',42.19458,-122.70948,20861),
(5713376,'Beaverton','OR','US',45.48706,-122.80371,96577),
(5713587,'Bend','OR','US',44.05817,-121.31531,87014),
(5713759,'Bethany','OR','US',45.55789,-122.8676,20646),
(5720727,'Corvallis','OR','US',44.56457,-123.26204,55780),
(5725846,'Eugene','OR','US',44.05207,-123.08675,163460),
(5727190,'Forest Grove','OR','US',45.51984,-123.11066,23897),
(5729080,'Grants Pass','OR','US',42.43933,-123.33067,37088),
(5729485,'Gresham','OR','US',45.49818,-122.43148,110553),
(5731371,'Hillsboro','OR','US',45.52289,-122.98983,102347),
(5734711,'Keizer','OR','US',44.99012,-123.02621,37895),
(5735238,'Klamath Falls','OR','US',42.22487,-121.78167,21399),
(5735724,'Lake Oswego','OR','US',45.42067,-122.67065,38496),
(5736378,'Lents','OR','US',45.47984,-122.56731,20156),
(5739936,'McMinnville','OR','US',45.21012,-123.19872,33892),
(5740099,'Medford','OR','US',42.32652,-122.87559,79805),
(5740900,'Milwaukie','OR','US',45.44623,-122.63926,20830),
(5742726,'Newberg','OR','US',45.30012,-122.97316,22780),
(5744253,'Oregon City','OR','US',45.35734,-122.60676,35831),
(5746545,'Portland','OR','US',45.52345,-122.67621,632309),
(5747882,'Redmond','OR','US',44.27262,-121.17392,28654),
(5749352,'Roseburg','OR','US',43.2165,-123.34174,22114),
(5750162,'Salem','OR','US',44.9429,-123.0351,164549),
(5754005,'Springfield','OR','US',44.04624,-123.02203,60870),
(5756758,'Tigard','OR','US',45.43123,-122.77149,51253),
(5757506,'Tualatin','OR','US',45.38401,-122.76399,27154),
(5760009,'West Linn','OR','US',45.36568,-122.61231,26593),
(5761287,'Wilsonville','OR','US',45.29984,-122.77371,22729),
(5761708,'Woodburn','OR','US',45.14373,-122.85537,25173),
(5768233,'Rapid City','SD','US',44.08054,-103.23101,73569),
(5771826,'Bountiful','UT','US',40.88939,-111.88077,43784),
(5772959,'Clearfield','UT','US',41.11078,-112.02605,30653),
(5773001,'Clinton','UT','US',41.13967,-112.0505,21399),
(5773304,'Cottonwood Heights','UT','US',40.61967,-111.81021,34343),
(5774001,'Draper','UT','US',40.52467,-111.86382,46774),
(5774215,'Eagle Mountain','UT','US',40.31412,-112.00688,27332),
(5774301,'East Millcreek','UT','US',40.69995,-111.81049,20816),
(5774662,'Farmington','UT','US',40.9805,-111.88744,22566),
(5775782,'Herriman','UT','US',40.51411,-112.03299,30835),
(5776008,'Holladay','UT','US',40.66884,-111.82466,30864),
(5776715,'Kaysville','UT','US',41.03522,-111.93855,30472),
(5776727,'Kearns','UT','US',40.65995,-111.99633,35731),
(5777107,'Layton','UT','US',41.06022,-111.97105,74143),
(5777224,'Lehi','UT','US',40.39162,-111.85077,58486),
(5777544,'Logan','UT','US',41.73549,-111.83439,50371),
(5777793,'Magna','UT','US',40.70911,-112.10161,26505),
(5778244,'Midvale','UT','US',40.61106,-111.89994,32613),
(5778352,'Millcreek','UT','US',40.68689,-111.87549,62139),
(5778755,'Murray','UT','US',40.66689,-111.88799,49250),
(5779206,'Ogden','UT','US',41.223,-111.97383,85444),
(5779334,'Orem','UT','US',40.2969,-111.69465,94457),
(5779816,'Pleasant Grove','UT','US',40.36412,-111.73854,38052),
(5780026,'Provo','UT','US',40.23384,-111.65853,115264),
(5780557,'Riverton','UT','US',40.52189,-111.9391,41900),
(5780802,'Roy','UT','US',41.16161,-112.02633,37964),
(5780993,'Salt Lake City','UT','US',40.76078,-111.89105,192672),
(5781061,'Sandy','UT','US',40.59161,-111.8841,87461),
(5781070,'Sandy Hills','UT','US',40.58106,-111.85077,89575),
(5781087,'Saratoga Springs','UT','US',40.34912,-111.90466,25407),
(5781765,'South Jordan Heights','UT','US',40.56384,-111.94938,37141),
(5781770,'South Jordan','UT','US',40.56217,-111.92966,66648),
(5781794,'South Salt Lake','UT','US',40.71884,-111.88827,24788),
(5781860,'Spanish Fork','UT','US',40.11496,-111.65492,37935),
(5781993,'Springville','UT','US',40.16523,-111.61075,32286),
(5782391,'Syracuse','UT','US',41.08939,-112.06467,27395),
(5782476,'Taylorsville','UT','US',40.66772,-111.93883,60514),
(5783695,'Tooele','UT','US',40.53078,-112.29828,33157),
(5784549,'West Jordan','UT','US',40.60967,-111.9391,111946),
(5784607,'West Valley City','UT','US',40.69161,-112.00105,136208),
(5785965,'Auburn','WA','US',47.30732,-122.22845,77006),
(5786882,'Bellevue','WA','US',47.61038,-122.20068,139820),
(5786899,'Bellingham','WA','US',48.75955,-122.48822,85146),
(5787829,'Bothell','WA','US',47.76232,-122.2054,42939),
(5788054,'Bremerton','WA','US',47.56732,-122.63264,39520),
(5788516,'Burien','WA','US',47.47038,-122.34679,50467),
(5788822,'Camas','WA','US',45.58706,-122.39954,21846),
(5790971,'Cottage Lake','WA','US',47.74427,-122.07735,22494),
(5792244,'Des Moines','WA','US',47.40177,-122.32429,31221),
(5793427,'Edmonds','WA','US',47.81065,-122.37736,41375),
(5793933,'Everett','WA','US',47.97898,-122.20208,108010),
(5794245,'Federal Way','WA','US',47.32232,-122.31262,95171),
(5795906,'Graham','WA','US',47.05288,-122.29428,23491),
(5798487,'Issaquah','WA','US',47.5301,-122.03262,36081),
(5799587,'Kenmore','WA','US',47.75732,-122.24401,22030),
(5799610,'Kennewick','WA','US',46.21125,-119.13723,78896),
(5799625,'Kent','WA','US',47.38093,-122.23484,126952),
(5799841,'Kirkland','WA','US',47.68149,-122.20874,87281),
(5800112,'Lacey','WA','US',47.03426,-122.82319,46409),
(5800317,'Lake Stevens','WA','US',48.0151,-122.06374,30886),
(5800420,'Lakewood','WA','US',47.17176,-122.51846,59829),
(5801617,'Longview','WA','US',46.13817,-122.93817,36848),
(5802049,'Lynnwood','WA','US',47.82093,-122.31513,36997),
(5802340,'Maple Valley','WA','US',47.39272,-122.04641,25686),
(5802570,'Marysville','WA','US',48.05176,-122.17708,66773),
(5803139,'Mercer Island','WA','US',47.57065,-122.22207,25042),
(5803457,'Mill Creek','WA','US',47.8601,-122.2043,20043),
(5803990,'Moses Lake','WA','US',47.13014,-119.27808,22082),
(5804127,'Mount Vernon','WA','US',48.42122,-122.33405,34053),
(5804191,'Mountlake Terrace','WA','US',47.78815,-122.30874,20989),
(5804306,'Mukilteo','WA','US',47.94454,-122.30458,21226),
(5804953,'North Creek','WA','US',47.81954,-122.17624,26410),
(5805441,'Oak Harbor','WA','US',48.29316,-122.64322,22693),
(5805687,'Olympia','WA','US',47.03787,-122.9007,50302),
(5805782,'Opportunity','WA','US',47.64995,-117.23991,25877),
(5806253,'Parkland','WA','US',47.15538,-122.43401,35803),
(5806298,'Pasco','WA','US',46.23958,-119.10057,69451),
(5807540,'Pullman','WA','US',46.73127,-117.17962,32816),
(5807575,'Puyallup','WA','US',47.18538,-122.2929,39659),
(5808079,'Redmond','WA','US',47.67399,-122.12151,60598),
(5808189,'Renton','WA','US',47.48288,-122.21707,100242),
(5808276,'Richland','WA','US',46.28569,-119.28446,54248),
(5809402,'Sammamish','WA','US',47.64177,-122.0804,52253),
(5809805,'SeaTac','WA','US',47.44846,-122.29217,28215),
(5809844,'Seattle','WA','US',47.60621,-122.33207,684451),
(5810301,'Shoreline','WA','US',47.75565,-122.34152,55439),
(5811456,'South Hill','WA','US',47.14121,-122.27012,52431),
(5811581,'Spanaway','WA','US',47.10399,-122.43457,27227),
(5811696,'Spokane','WA','US',47.65966,-117.42908,213272),
(5811729,'Spokane Valley','WA','US',47.67323,-117.23937,94919),
(5812944,'Tacoma','WA','US',47.25288,-122.44429,207948),
(5814043,'Tukwila','WA','US',47.47399,-122.26096,20018),
(5814450,'University Place','WA','US',47.23565,-122.5504,32842),
(5814616,'Vancouver','WA','US',45.63873,-122.66149,172860),
(5814916,'Walla Walla','WA','US',46.06458,-118.34302,32237),
(5815342,'Wenatchee','WA','US',47.42346,-120.31035,33636),
(5815538,'West Lake Sammamish','WA','US',47.5776,-122.10123,33929),
(5815539,'West Lake Stevens','WA','US',47.99343,-122.1018,21047),
(5816320,'Bainbridge Island','WA','US',47.62621,-122.52124,23840),
(5816605,'Yakima','WA','US',46.60207,-120.5059,93701),
(5820705,'Casper','WY','US',42.86663,-106.31308,60285),
(5821086,'Cheyenne','WY','US',41.13998,-104.82025,63335),
(5826027,'Gillette','WY','US',44.29109,-105.50222,32649),
(5830062,'Laramie','WY','US',41.31137,-105.5911,32158),
(5836898,'Rock Springs','WY','US',41.58746,-109.2029,23962),
(5844096,'American Fork','UT','US',40.3769,-111.79576,28326),
(5847411,'Kahului','HI','US',20.88953,-156.47432,26337),
(5847486,'Kailua','HI','US',21.40241,-157.74054,38635),
(5848189,'Kaneohe','HI','US',21.39994,-157.79895,34597),
(5849297,'Kīhei','HI','US',20.76462,-156.44578,20881),
(5851030,'Mililani Town','HI','US',21.4504,-158.01503,27629),
(5852275,'Pearl City','HI','US',21.39734,-157.97516,47698),
(5854686,'Waipahu','HI','US',21.38667,-158.00917,38216),
(5855070,'‘Ewa Gentry','HI','US',21.33999,-158.03039,22690),
(5855927,'Hilo','HI','US',19.72991,-155.09073,43263),
(5856195,'Honolulu','HI','US',21.30694,-157.85833,371657),
(5861187,'Eagle River','AK','US',61.32139,-149.56778,24793),
(5861897,'Fairbanks','AK','US',64.83778,-147.71639,32325),
(5879400,'Anchorage','AK','US',61.21806,-149.90028,298695),
(6331908,'Milton','GA','US',34.13216,-84.30067,37547),
(6331909,'Johns Creek','GA','US',34.02893,-84.19858,83335),
(6332309,'Cutler Bay','FL','US',25.5783,-80.3377,44865),
(6332422,'Morningside Heights','NY','US',40.81,-73.9625,55929),
(6332428,'East Harlem','NY','US',40.79472,-73.9425,115921),
(6332439,'Alafaya','FL','US',28.5641,-81.2114,78113),
(6640032,'Briarwood','NY','US',40.70935,-73.81529,53877),
(6941080,'Fort Bragg','NC','US',35.139,-79.00603,29183),
(7160204,'City of Milford (balance)','CT','US',41.22374,-73.06164,51271),
(7174365,'City of Sammamish','WA','US',47.60444,-122.03768,45780),
(7176035,'Silver Firs','WA','US',47.86602,-122.1551,20891),
(7176039,'Vineyard','CA','US',38.46449,-121.34692,24836),
(7184841,'Gramercy Park','NY','US',40.7375,-73.98611,27988),
(7250691,'Kew Gardens Hills','NY','US',40.73002,-73.8234,37479),
(7257540,'Braintree','MA','US',42.20384,-71.00215,37297),
(7257991,'Bel Air North','MD','US',39.55429,-76.37309,30568),
(7257992,'Bel Air South','MD','US',39.50506,-76.31977,47709),
(7258271,'Mercerville-Hamilton Square','NJ','US',40.23126,-74.67223,26419),
(7258432,'Oxon Hill-Glassmanor','MD','US',38.79615,-76.97499,35355),
(7258780,'West Falls Church','VA','US',38.86484,-77.18787,29207),
(7259034,'St. Charles','MD','US',38.60728,-76.92478,33379),
(7259061,'Suitland-Silver Hill','MD','US',38.84685,-76.92591,33515),
(7259480,'Saginaw Township North','MI','US',43.46004,-84.00674,24994),
(7259621,'West Bloomfield Township','MI','US',42.56891,-83.38356,64690),
(7259705,'East Lake-Orient Park','FL','US',27.98269,-82.37878,22753),
(7259780,'Four Corners','FL','US',28.33287,-81.64738,26116),
(7259823,'Greater Northdale','FL','US',28.10545,-82.52594,22079),
(7260019,'Candler-McAfee','GA','US',33.72672,-84.27246,23025),
(7260219,'University','FL','US',28.07389,-82.43902,41163),
(7260233,'Vero Beach South','FL','US',27.61638,-80.41308,23092),
(7260327,'Kendall West','FL','US',25.7065,-80.4388,36154),
(7260548,'Palm River-Clair Mel','FL','US',27.92386,-82.37939,21024),
(7260806,'Arden-Arcade','CA','US',38.6025,-121.37854,92186),
(7261268,'Florence-Graham','CA','US',33.96772,-118.24438,63387),
(7261291,'Fort Hood','TX','US',31.13489,-97.77561,29589),
(7261476,'Inglewood-Finn Hill','WA','US',47.72049,-122.23167,22707),
(7261759,'East Hill-Meridian','WA','US',47.41052,-122.17369,29878),
(7262110,'Picnic Point-North Lynnwood','WA','US',47.86278,-122.29497,22953),
(7262349,'Security-Widefield','CO','US',38.74728,-104.71439,32882),
(7262518,'West Whittier-Los Nietos','CA','US',33.976,-118.06909,25540),
(7262622,'Summerlin South','NV','US',36.11708,-115.33001,24085),
(7310164,'San Tan Valley','AZ','US',33.1911,-111.528,81321),
(7315237,'Oakleaf Plantation','FL','US',30.17083,-81.83549,20315),
(7315245,'East Honolulu','HI','US',21.28906,-157.71734,49914),
(7315412,'Eastmont','WA','US',47.8974,-122.18154,20101),
(7839240,'Enchanted Hills','NM','US',35.33676,-106.59296,87521),
(8030162,'West Hills','CA','US',34.19731,-118.64398,41426),
(8096113,'The Acreage','FL','US',26.79404,-80.26749,38704),
(8096217,'Eastvale','CA','US',33.96358,-117.56418,59039),
(8097131,'Oak Hill','VA','US',38.9258,-77.40156,33811),
(8299576,'Bridgewater','NJ','US',40.60079,-74.64815,44464),
(8347326,'Fairfield Heights','IN','US',39.82861,-86.38224,21285),
(8436065,'Chicago Loop','IL','US',41.88407,-87.6333,33442),
(8436083,'Greater Grand Crossing','IL','US',41.76113,-87.61485,32346),
(8436084,'Auburn Gresham','IL','US',41.74179,-87.65322,45842),
(8436473,'Financial District','NY','US',40.70789,-74.00857,60976),
(8436486,'Sunset Park','NY','US',40.64548,-74.01241,126000),
(8436572,'South Kingstown','RI','US',41.44718,-71.52494,30826),
(8449772,'Noe Valley','CA','US',37.75018,-122.43369,22893),
(8449777,'Visitacion Valley','CA','US',37.71715,-122.40433,22534),
(8449910,'La Porte','IN','US',41.60774,-86.71389,21916),
(8469295,'Randolph','NJ','US',40.84829,-74.58148,25734),
(8478941,'Mount Pleasant','WI','US',42.69743,-87.85577,26272),
(8479411,'Northdale','FL','US',28.0939,-82.50561,22079),
(8531960,'Lincoln','RI','US',41.92111,-71.435,21670),
(8604682,'Johnston','RI','US',41.82186,-71.50675,29247),
(8605040,'Hot Springs National Park','AR','US',34.5317,-93.06377,35193),
(8605041,'Dixiana','AL','US',33.74021,-86.64938,22940),
(8643098,'Cranberry Township','PA','US',40.68496,-80.10714,28098),
(9958118,'Center City','PA','US',39.9512,-75.15923,57239),
(10104153,'Silver Lake','CA','US',34.08668,-118.27023,32890),
(10104154,'Echo Park','CA','US',34.07808,-118.26066,43832),
(11704266,'St. Johns','FL','US',30.0815,-81.54774,40000),
(11748973,'Stonecrest','GA','US',33.70849,-84.13485,50000),
(11838960,'Valley Glen','CA','US',34.18991,-118.44953,60000),
(11979227,'Encanto','AZ','US',33.47937,-112.07823,54614),
(11979238,'Central City','AZ','US',33.44001,-112.05805,58161),
(900000001,'New York','NY','US',40.71427,-74.00597,8175133)
on conflict (id) do nothing;

-- ============================== 10_fans.sql ==============================
-- Fan list: fans sign up on a comic's site with their email and city, and the comic can see
-- who lives near each show. The list belongs to that comic's site; nobody else can read it.
-- Run once in Supabase → SQL Editor, after 09_places.sql. Safe to run again.

-- Clubs get a map position from their city, so we can measure distance to fans.
alter table venues add column if not exists lat double precision;
alter table venues add column if not exists lng double precision;

create or replace function public.locate_venue() returns trigger language plpgsql set search_path = public as $$
declare p record;
begin
  if new.lat is null or tg_op = 'INSERT' or new.city is distinct from old.city or new.state is distinct from old.state then
    select lat, lng into p from places
      where lower(name) = lower(trim(new.city)) and (new.state is null or state is null or upper(state) = upper(new.state))
      order by (upper(coalesce(state, '')) = upper(coalesce(new.state, ''))) desc, population desc limit 1;
    new.lat := p.lat; new.lng := p.lng;
  end if;
  return new;
end $$;
drop trigger if exists venues_locate on venues;
create trigger venues_locate before insert or update of city, state on venues for each row execute function public.locate_venue();
update venues set city = city where lat is null;  -- fill in the clubs we already have

-- Miles between two points
create or replace function public.miles(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 3958.8 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

create table if not exists fans (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  place_id bigint references places(id) on delete set null,
  city text,
  state text,
  lat double precision,
  lng double precision,
  radius_mi int not null default 50 check (radius_mi in (25, 50, 100, 250)),
  token uuid not null default gen_random_uuid() unique,  -- for a one-click "stop emailing me" link
  created_at timestamptz not null default now()
);
create unique index if not exists fans_site_email on fans (site_id, lower(email));
alter table fans enable row level security;
drop policy if exists "site admins read fans" on fans;
create policy "site admins read fans" on fans for select to authenticated using (public.is_site_admin(site_id));
drop policy if exists "site admins remove fans" on fans;
create policy "site admins remove fans" on fans for delete to authenticated using (public.is_site_admin(site_id));
grant select, delete on fans to authenticated;

-- Fans join through this, so nobody can read the list or sign someone up to another site's list.
create or replace function public.join_fans(p_site text, p_email text, p_place bigint, p_radius int default 50)
returns text language plpgsql security definer set search_path = public as $$
declare p record; e text := lower(trim(p_email)); existed boolean;
begin
  if not exists (select 1 from sites where id = p_site and coalesce((features->>'fans')::boolean, false)) then
    raise exception 'This site isn''t taking sign-ups right now.' using errcode = 'P0001';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 200 then
    raise exception 'That email doesn''t look right.' using errcode = 'P0001';
  end if;
  select * into p from places where id = p_place;
  if not found then raise exception 'Pick your city from the list.' using errcode = 'P0001'; end if;
  existed := exists (select 1 from fans where site_id = p_site and lower(email) = e);
  insert into fans (site_id, email, place_id, city, state, lat, lng, radius_mi)
    values (p_site, e, p.id, p.name, p.state, p.lat, p.lng, case when p_radius in (25, 50, 100, 250) then p_radius else 50 end)
  on conflict (site_id, lower(email)) do update set place_id = excluded.place_id, city = excluded.city, state = excluded.state,
    lat = excluded.lat, lng = excluded.lng, radius_mi = excluded.radius_mi;
  return case when existed then 'updated' else 'joined' end;
end $$;
revoke all on function public.join_fans(text, text, bigint, int) from public;
grant execute on function public.join_fans(text, text, bigint, int) to anon, authenticated;

create or replace function public.leave_fans(p_token uuid) returns boolean
language sql security definer set search_path = public as $$
  with gone as (delete from fans where token = p_token returning 1) select exists (select 1 from gone);
$$;
revoke all on function public.leave_fans(uuid) from public;
grant execute on function public.leave_fans(uuid) to anon, authenticated;

-- For the admin: each upcoming show and how many fans live within their chosen distance of it.
create or replace function public.fans_near_shows(p_site text)
returns table (show_id uuid, fans int) language sql stable security invoker set search_path = public as $$
  select s.id, count(f.id)::int
  from shows s join venues v on v.id = s.venue_id
  left join fans f on f.site_id = s.site_id and f.lat is not null and v.lat is not null
    and public.miles(f.lat, f.lng, v.lat, v.lng) <= f.radius_mi
  where s.site_id = p_site and s.date >= current_date
  group by s.id;
$$;
grant execute on function public.fans_near_shows(text) to authenticated;

-- For the admin: the fans near one show (only works for that site's admins, because of the fans rules above)
create or replace function public.fans_near_show(p_show uuid)
returns setof fans language sql stable security invoker set search_path = public as $$
  select f.* from shows s join venues v on v.id = s.venue_id
  join fans f on f.site_id = s.site_id and f.lat is not null and v.lat is not null and public.miles(f.lat, f.lng, v.lat, v.lng) <= f.radius_mi
  where s.id = p_show order by f.created_at;
$$;
grant execute on function public.fans_near_show(uuid) to authenticated;

-- ============================== 11_comics.sql ==============================
-- Comics are people on ComicTable, not on one site.
-- A comic has one profile, one set of stand-up dates and their own YouTube channels, and can be on
-- several sites (their own site, plus any podcast they co-host). Add a date once and it shows everywhere
-- they're listed. Sites can still write their own bio and title for a comic.
-- Run once in Supabase → SQL Editor, after 10_fans.sql. Safe to run again.

/* ---------------- comics ---------------- */
create table if not exists comics (
  id text primary key,
  name text not null,
  title text default 'Comedian',
  bio text default '',
  status text,
  photo_url text,
  instagram text,
  youtube text,
  tiktok text,
  twitter text,
  website text,
  user_id uuid references auth.users(id) on delete set null,  -- the comic's own login, once they have one
  created_at timestamptz not null default now()
);

-- A site's lineup stays in "hosts": one row per comic per site, with the site's order, hide switch,
-- and (optionally) the site's own bio and title. Name, photo, socials and status always come from the comic.
alter table hosts add column if not exists comic_id text references comics(id) on delete cascade;
alter table hosts add column if not exists own_bio boolean not null default false;
alter table hosts add column if not exists own_title boolean not null default false;
create unique index if not exists hosts_site_comic on hosts (site_id, comic_id);

create or replace function public.comic_slug(n text) returns text language sql immutable as $$
  select coalesce(nullif(trim(both '-' from lower(regexp_replace(trim(n), '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'comic');
$$;

-- Everyone already on a site becomes a comic. People with the same name on two sites become one comic.
insert into comics (id, name, title, bio, status, photo_url, instagram, youtube, tiktok, twitter, website)
select distinct on (public.comic_slug(name)) public.comic_slug(name), name, title, bio, status, photo_url, instagram, youtube, tiktok, twitter, website
from hosts where comic_id is null
order by public.comic_slug(name), sort
on conflict (id) do nothing;
update hosts set comic_id = public.comic_slug(name) where comic_id is null;

-- Who can change a comic: the comic, ComicTable super admins, and the team of any site they're on.
create or replace function public.can_edit_comic(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
      or exists (select 1 from comics where id = c and user_id = auth.uid())
      or exists (select 1 from hosts h join admins a on a.site_id = h.site_id and a.user_id = auth.uid() where h.comic_id = c);
$$;
grant execute on function public.can_edit_comic(text) to anon, authenticated;

alter table comics enable row level security;
drop policy if exists "public read" on comics;
create policy "public read" on comics for select using (true);
drop policy if exists "editors update" on comics;
create policy "editors update" on comics for update to authenticated using (public.can_edit_comic(id)) with check (public.can_edit_comic(id));
drop policy if exists "admins add" on comics;
create policy "admins add" on comics for insert to authenticated
  with check (exists (select 1 from admins where user_id = auth.uid()) or exists (select 1 from platform_admins where user_id = auth.uid()));
drop policy if exists "super admins delete" on comics;
create policy "super admins delete" on comics for delete to authenticated using (exists (select 1 from platform_admins where user_id = auth.uid()));
grant select on comics to anon, authenticated;
grant insert, update, delete on comics to authenticated;

-- Keep every site's copy of a comic in step with their profile (skipping a site's own bio/title).
create or replace function public.comic_to_hosts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update hosts set name = new.name, status = new.status, photo_url = new.photo_url, instagram = new.instagram, youtube = new.youtube,
    tiktok = new.tiktok, twitter = new.twitter, website = new.website,
    bio = case when own_bio then bio else new.bio end, title = case when own_title then title else new.title end
  where comic_id = new.id;
  return new;
end $$;
drop trigger if exists comics_sync on comics;
create trigger comics_sync after update on comics for each row execute function public.comic_to_hosts();

-- When a comic joins a site, or a site goes back to the shared bio/title, copy from the comic.
create or replace function public.host_from_comic() returns trigger language plpgsql set search_path = public as $$
declare c record;
begin
  if new.comic_id is null then return new; end if;
  select * into c from comics where id = new.comic_id;
  if not found then return new; end if;
  new.name := c.name; new.status := c.status; new.photo_url := c.photo_url; new.instagram := c.instagram; new.youtube := c.youtube;
  new.tiktok := c.tiktok; new.twitter := c.twitter; new.website := c.website;
  if not new.own_bio then new.bio := c.bio; end if;
  if not new.own_title then new.title := c.title; end if;
  return new;
end $$;
drop trigger if exists hosts_from_comic on hosts;
create trigger hosts_from_comic before insert or update of comic_id, own_bio, own_title on hosts for each row execute function public.host_from_comic();

/* ---------------- shows ---------------- */
-- A solo date belongs to a comic (comic_id). A show event ("Modern Apes LIVE") belongs to a site, with a lineup.
alter table shows add column if not exists comic_id text references comics(id) on delete cascade;
alter table shows add column if not exists lineup text[];
alter table shows alter column host drop not null;
-- Taking someone off a site must not delete their dates: they belong to the comic now.
alter table shows drop constraint if exists shows_host_fkey;
alter table shows add constraint shows_host_fkey foreign key (host) references hosts(id) on delete set null;
update shows s set comic_id = h.comic_id from hosts h where s.host = h.id and s.comic_id is null;

-- A date's comic follows whoever it's assigned to. (When someone leaves a site, host goes empty but the date stays theirs.)
create or replace function public.show_comic() returns trigger language plpgsql set search_path = public as $$
begin
  if new.host is not null and (tg_op = 'INSERT' or new.host is distinct from old.host) then
    select comic_id into new.comic_id from hosts where id = new.host;
  end if;
  return new;
end $$;
drop trigger if exists shows_comic on shows;
create trigger shows_comic before insert or update of host on shows for each row execute function public.show_comic();

drop policy if exists "comic editors" on shows;
create policy "comic editors" on shows for all to authenticated
  using (comic_id is not null and public.can_edit_comic(comic_id)) with check (comic_id is not null and public.can_edit_comic(comic_id));

/* ---------------- YouTube ---------------- */
alter table sources add column if not exists comic_id text references comics(id) on delete cascade;
alter table videos add column if not exists comic_id text references comics(id) on delete set null;
update sources s set comic_id = h.comic_id from hosts h where s.host = h.id and s.comic_id is null;
update videos v set comic_id = h.comic_id from hosts h where v.host = h.id and v.comic_id is null;
drop policy if exists "comic editors" on sources;
create policy "comic editors" on sources for all to authenticated
  using (comic_id is not null and public.can_edit_comic(comic_id)) with check (comic_id is not null and public.can_edit_comic(comic_id));
drop policy if exists "comic editors" on videos;
create policy "comic editors" on videos for all to authenticated
  using (comic_id is not null and public.can_edit_comic(comic_id)) with check (comic_id is not null and public.can_edit_comic(comic_id));

/* ---------------- hiding a comic's date or video on one site ---------------- */
create table if not exists site_hidden (
  site_id text not null references sites(id) on delete cascade,
  kind text not null check (kind in ('show', 'video')),
  item_id uuid not null,
  primary key (site_id, kind, item_id)
);
alter table site_hidden enable row level security;
drop policy if exists "public read" on site_hidden;
create policy "public read" on site_hidden for select using (true);
drop policy if exists "site admin manage" on site_hidden;
create policy "site admin manage" on site_hidden for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id));
grant select on site_hidden to anon, authenticated;
grant insert, delete on site_hidden to authenticated;

/* ---------------- what each site shows ---------------- */
-- A site's shows: every date of every comic in its lineup, plus its own show events.
-- "host" comes back as that comic's id on this site, so pages and filters work the same everywhere.
create or replace function public.site_shows(p_site text, p_all boolean default false)
returns setof jsonb language sql stable set search_path = public as $$
  -- site_id stays the site it was added on; lineup stays comic ids, lineup_hosts is the same people on this site
  select to_jsonb(s) || jsonb_build_object(
      'host', h.id,
      'event', s.comic_id is null,
      'lineup_hosts', (select coalesce(jsonb_agg(h2.id order by h2.sort), '[]'::jsonb) from hosts h2 where h2.site_id = p_site and h2.comic_id = any (s.lineup)),
      'hidden_here', exists (select 1 from site_hidden x where x.site_id = p_site and x.kind = 'show' and x.item_id = s.id) or coalesce(h.hidden, false))
  from shows s
  left join hosts h on h.site_id = p_site and h.comic_id = s.comic_id
  where ((s.comic_id is not null and h.id is not null) or (s.comic_id is null and s.site_id = p_site))
    and (p_all or s.date >= current_date)
    and (p_all or not (exists (select 1 from site_hidden x where x.site_id = p_site and x.kind = 'show' and x.item_id = s.id) or coalesce(h.hidden, false)))
  order by s.date, s.time;
$$;
grant execute on function public.site_shows(text, boolean) to anon, authenticated;

-- A site's videos: its own channels, plus the channels of comics in its lineup.
create or replace function public.site_videos(p_site text, p_all boolean default false)
returns setof jsonb language sql stable set search_path = public as $$
  select to_jsonb(v) || jsonb_build_object(
      'host', h.id,
      'hidden_here', (v.site_id = p_site and v.hidden) or exists (select 1 from site_hidden x where x.site_id = p_site and x.kind = 'video' and x.item_id = v.id))
  from videos v
  left join hosts h on h.site_id = p_site and h.comic_id = v.comic_id
  where (v.site_id = p_site or (v.comic_id is not null and h.id is not null and not h.hidden))
    and (p_all or not ((v.site_id = p_site and v.hidden) or exists (select 1 from site_hidden x where x.site_id = p_site and x.kind = 'video' and x.item_id = v.id)))
  order by v.published desc nulls last
  limit case when p_all then 2000 else 200 end;
$$;
grant execute on function public.site_videos(text, boolean) to anon, authenticated;

/* ---------------- fan list follows the new shows ---------------- */
create or replace function public.fans_near_shows(p_site text)
returns table (show_id uuid, fans int) language sql stable security invoker set search_path = public as $$
  select (r->>'id')::uuid, count(f.id)::int
  from public.site_shows(p_site) r
  join venues v on v.id = (r->>'venue_id')::uuid
  left join fans f on f.site_id = p_site and f.lat is not null and v.lat is not null
    and public.miles(f.lat, f.lng, v.lat, v.lng) <= f.radius_mi
  group by 1;
$$;
-- The fans of one site who are near one show (only that site's admins get anything back).
drop function if exists public.fans_near_show(uuid);
create or replace function public.fans_near_show(p_show uuid, p_site text)
returns setof fans language sql stable security invoker set search_path = public as $$
  select f.* from shows s join venues v on v.id = s.venue_id
  join fans f on f.site_id = p_site and f.lat is not null and v.lat is not null and public.miles(f.lat, f.lng, v.lat, v.lng) <= f.radius_mi
  where s.id = p_show
    and (s.site_id = p_site or exists (select 1 from hosts h where h.site_id = p_site and h.comic_id = s.comic_id))
  order by f.created_at;
$$;
grant execute on function public.fans_near_show(uuid, text) to authenticated;

-- ============================== 12_show_finder.sql ==============================
-- Show finder: comics give ComicTable the pages where their dates are listed (their tour page, a club's
-- calendar, Eventbrite, a calendar feed), and it checks them every hour. Each link either adds new dates
-- straight away or puts them in a "Found shows" list to check first.
-- Run once in Supabase → SQL Editor, after 11_comics.sql. Safe to run again.

alter table sources drop constraint if exists sources_kind_check;
alter table sources add constraint sources_kind_check check (kind in ('podcast', 'youtube', 'shows'));
alter table sources add column if not exists auto_add boolean not null default false;  -- shows: add new dates without asking
alter table sources add column if not exists match_all boolean not null default false; -- shows: every show on the page is theirs (their own tour page)

create table if not exists found_shows (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) on delete cascade,
  site_id text not null references sites(id) on delete cascade,
  comic_id text references comics(id) on delete cascade,
  key text not null,                 -- date + time + venue, so the same listing is only found once
  date date not null,
  time text,
  venue text,
  city text,
  venue_id uuid references venues(id) on delete set null,
  url text,
  status text not null default 'on_sale',
  title text,                        -- the listing's own name, e.g. "Tristan Bowling Live!"
  state text not null default 'new' check (state in ('new', 'added', 'ignored')),
  created_at timestamptz not null default now()
);
create unique index if not exists found_shows_key on found_shows (coalesce(comic_id, site_id), key);
alter table found_shows enable row level security;
drop policy if exists "site admins" on found_shows;
create policy "site admins" on found_shows for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id));
drop policy if exists "comic editors" on found_shows;
create policy "comic editors" on found_shows for all to authenticated
  using (comic_id is not null and public.can_edit_comic(comic_id)) with check (comic_id is not null and public.can_edit_comic(comic_id));
grant select, insert, update, delete on found_shows to authenticated;

-- ============================== 13_me.sql ==============================
-- "Me": a comic with their own login sees all their dates across every site they're on.
-- Run once in Supabase → SQL Editor, after 12_show_finder.sql. Safe to run again.

-- Every upcoming date for one comic: their solo dates, plus show events they're in, with the site's name.
create or replace function public.comic_shows(p_comic text)
returns setof jsonb language sql stable set search_path = public as $$
  select to_jsonb(s) || jsonb_build_object('site_name', st.name, 'event', s.comic_id is null)
  from shows s join sites st on st.id = s.site_id
  where (s.comic_id = p_comic or p_comic = any (s.lineup)) and s.date >= current_date
  order by s.date, s.time;
$$;
grant execute on function public.comic_shows(text) to anon, authenticated;

create index if not exists comics_user on comics (user_id);

-- ============================== 14_blog.sql ==============================
-- Blog: a comic writes posts in their dashboard; published ones show on their site.
-- Run once in Supabase → SQL Editor, after 13_me.sql. Safe to run again.

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 100000),
  excerpt text check (length(excerpt) <= 500),
  cover_url text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists blog_posts_slug on blog_posts (site_id, slug);
create index if not exists blog_posts_site on blog_posts (site_id, published, published_at desc);
alter table blog_posts enable row level security;
drop policy if exists "public read published" on blog_posts;
create policy "public read published" on blog_posts for select using (published or public.is_site_admin(site_id));
drop policy if exists "site admin write" on blog_posts;
create policy "site admin write" on blog_posts for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id));
grant select on blog_posts to anon, authenticated;
grant insert, update, delete on blog_posts to authenticated;

-- Publishing stamps the date once; editing keeps it.
create or replace function public.blog_stamp() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.published and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists blog_posts_stamp on blog_posts;
create trigger blog_posts_stamp before insert or update on blog_posts for each row execute function public.blog_stamp();

-- ============================== 99_rules.sql ==============================
-- ComicTable's access rules: every function and policy that decides who can do what, in one place.
-- This file always runs LAST (it's at the end of every UPGRADE bundle), so re-running an older upgrade
-- can never undo the current rules. Change a rule here, not in the numbered files. Safe to run again.
--
-- Roles
-- ComicTable staff (platform_admins):
--   admin: everything, including staff, creating sites, deleting comics and the comictable.com showcase
--   staff: works on every site and comic, but can't add or remove staff, create sites, delete comics,
--          change what comictable.com shows off, or manage a site's team
-- A site's team (admins):
--   owner: everything on the site, including the team
--   editor: everything but the team
--   shows: dates, ticket links, clubs and the show finder only
--   moderator: forum, chat, bans and the moderation log only

/* ---------------- the roles themselves ---------------- */
alter table platform_admins add column if not exists role text not null default 'admin';
alter table platform_admins drop constraint if exists platform_admins_role_check;
alter table platform_admins add constraint platform_admins_role_check check (role in ('admin', 'staff'));

alter table admins drop constraint if exists admins_role_check;
alter table admins add constraint admins_role_check check (role in ('owner', 'editor', 'shows', 'moderator'));

/* ---------------- who can do what ---------------- */
-- Full access to a site's content: its owners and editors, and all ComicTable staff.
create or replace function public.is_site_admin(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and site_id = sid and role in ('owner', 'editor'))
      or exists (select 1 from platform_admins where user_id = auth.uid());
$$;
-- One part of a site: full access, or the role made for that part.
create or replace function public.can_site(sid text, area text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_site_admin(sid)
      or exists (select 1 from admins where user_id = auth.uid() and site_id = sid
                 and ((area = 'shows' and role = 'shows') or (area = 'community' and role = 'moderator')));
$$;
grant execute on function public.can_site(text, text) to anon, authenticated;
-- ComicTable staff of any kind, and ComicTable admins only.
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;
create or replace function public.is_platform_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid() and role = 'admin');
$$;
grant execute on function public.is_platform_owner() to anon, authenticated;

-- A comic's profile: the comic, ComicTable staff, and owners/editors of any site they're on.
create or replace function public.can_edit_comic(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
      or exists (select 1 from comics where id = c and user_id = auth.uid())
      or exists (select 1 from hosts h join admins a on a.site_id = h.site_id and a.user_id = auth.uid() and a.role in ('owner', 'editor') where h.comic_id = c);
$$;
-- A comic's dates: the same people, plus "shows" people on any site they're on.
create or replace function public.can_edit_comic_dates(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_edit_comic(c)
      or exists (select 1 from hosts h join admins a on a.site_id = h.site_id and a.user_id = auth.uid() and a.role = 'shows' where h.comic_id = c);
$$;
grant execute on function public.can_edit_comic_dates(text) to anon, authenticated;

/* ---------------- shows: owners, editors, staff, and "shows" people ---------------- */
drop policy if exists "site admin write" on shows;
create policy "site admin write" on shows for all to authenticated using (public.can_site(site_id, 'shows')) with check (public.can_site(site_id, 'shows'));
drop policy if exists "comic editors" on shows;
create policy "comic editors" on shows for all to authenticated
  using (comic_id is not null and public.can_edit_comic_dates(comic_id)) with check (comic_id is not null and public.can_edit_comic_dates(comic_id));
drop policy if exists "site admins" on found_shows;
create policy "site admins" on found_shows for all to authenticated using (public.can_site(site_id, 'shows')) with check (public.can_site(site_id, 'shows'));
drop policy if exists "comic editors" on found_shows;
create policy "comic editors" on found_shows for all to authenticated
  using (comic_id is not null and public.can_edit_comic_dates(comic_id)) with check (comic_id is not null and public.can_edit_comic_dates(comic_id));
-- the show finder's links (podcast and YouTube sources stay with owners and editors)
drop policy if exists "shows people manage show sources" on sources;
create policy "shows people manage show sources" on sources for all to authenticated
  using (kind = 'shows' and public.can_site(site_id, 'shows')) with check (kind = 'shows' and public.can_site(site_id, 'shows'));
-- hiding a date on one site
drop policy if exists "site admin manage" on site_hidden;
create policy "site admin manage" on site_hidden for all to authenticated
  using (public.is_site_admin(site_id) or (kind = 'show' and public.can_site(site_id, 'shows')))
  with check (public.is_site_admin(site_id) or (kind = 'show' and public.can_site(site_id, 'shows')));
-- clubs: shows people can add a new (unverified) club for their site and fix the ones they added, like owners and editors
drop policy if exists "site admins add venues" on venues;
drop policy if exists "read venues" on venues;
create policy "read venues" on venues for select using (
  status = 'approved' or public.can_site(created_by_site, 'shows') or public.is_platform_admin());
drop policy if exists "add venues" on venues;
create policy "add venues" on venues for insert to authenticated with check (
  public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')));
drop policy if exists "edit venues" on venues;
create policy "edit venues" on venues for update to authenticated using (
  public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')))
  with check (public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')));

/* ---------------- forum and chat: owners, editors, staff, and moderators ---------------- */
do $$
declare t text;
begin
  foreach t in array array['threads', 'posts', 'bans', 'mod_log', 'chat_messages'] loop
    execute format('drop policy if exists "site admin manage" on %I', t);
    execute format('create policy "site admin manage" on %I for all to authenticated using (public.can_site(site_id, ''community'')) with check (public.can_site(site_id, ''community''))', t);
  end loop;
end $$;
drop policy if exists "public read" on chat_messages;
create policy "public read" on chat_messages for select using (not deleted or public.can_site(site_id, 'community'));

/* ---------------- photos: only into a site you can edit (or your own Coaster's sites) ---------------- */
-- Files live under "<site id>/…". Owners, editors and staff can add or change a site's photos.
-- A comic with their own login can add photos for the sites they're on (their profile photo).
create or replace function public.can_upload_photos(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_site_admin(folder)
      or exists (select 1 from hosts h join comics c on c.id = h.comic_id
                 where h.site_id = folder and c.user_id = auth.uid());
$$;
grant execute on function public.can_upload_photos(text) to authenticated;
drop policy if exists "admin upload photos" on storage.objects;
drop policy if exists "admin update photos" on storage.objects;
drop policy if exists "admin delete photos" on storage.objects;
drop function if exists public.can_upload_photos();  -- the older one from 16_photo_uploads.sql
create policy "admin upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_upload_photos((storage.foldername(name))[1]));
create policy "admin update photos" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.can_upload_photos((storage.foldername(name))[1]));
create policy "admin delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_upload_photos((storage.foldername(name))[1]));

/* ---------------- comics: added by owners and editors (any site) or ComicTable staff ---------------- */
drop policy if exists "admins add" on comics;
create policy "admins add" on comics for insert to authenticated
  with check (exists (select 1 from admins where user_id = auth.uid() and role in ('owner', 'editor'))
           or exists (select 1 from platform_admins where user_id = auth.uid()));

/* ---------------- clubs: "Shows only" people can remove an unverified club their site added ---------------- */
drop policy if exists "remove venues" on venues;
create policy "remove venues" on venues for delete to authenticated using (
  public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')));

/* ---------------- ComicTable admins only ---------------- */
create or replace function public.create_site(p_id text, p_name text, p_domain text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can create sites.' using errcode = 'P0001';
  end if;
  if p_id !~ '^[a-z0-9][a-z0-9-]{1,40}$' then
    raise exception 'A site id uses lowercase letters, numbers and dashes, like "john-smith".' using errcode = 'P0001';
  end if;
  if exists (select 1 from sites where id = p_id) then
    raise exception 'There''s already a site called "%".', p_id using errcode = 'P0001';
  end if;
  insert into sites (id, name, domain, features)
    values (p_id, p_name, nullif(trim(coalesce(p_domain, '')), ''),
            '{"shows": true, "podcast": true, "videos": true, "merch": false, "forum": false, "chat": false}');
  insert into boards (site_id, id, name, description, sort) values
    (p_id, 'general', 'General', 'Talk about anything', 0),
    (p_id, 'shows', 'Live Shows', 'Going to a show? Saw one? Post here', 1),
    (p_id, 'episodes', 'Episodes', 'Talk about the latest episodes', 2);
end $$;

drop function if exists public.platform_admin_list();
create or replace function public.platform_admin_list()
returns table (user_id uuid, email text, role text, you boolean) language sql stable security definer set search_path = public as $$
  select p.user_id, u.email::text, p.role, p.user_id = auth.uid()
  from platform_admins p join auth.users u on u.id = p.user_id
  where exists (select 1 from platform_admins where user_id = auth.uid())
  order by p.role, u.email;
$$;
revoke all on function public.platform_admin_list() from public;
grant execute on function public.platform_admin_list() to authenticated;

create or replace function public.remove_platform_admin(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can do that.' using errcode = 'P0001';
  end if;
  if p_user = auth.uid() then
    raise exception 'You can''t remove yourself.' using errcode = 'P0001';
  end if;
  delete from platform_admins where user_id = p_user;
end $$;

-- Change someone's ComicTable role. There's always at least one admin left.
create or replace function public.set_platform_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can do that.' using errcode = 'P0001';
  end if;
  if p_role not in ('admin', 'staff') then
    raise exception 'Pick admin or staff.' using errcode = 'P0001';
  end if;
  if p_role = 'staff' and not exists (select 1 from platform_admins where role = 'admin' and user_id <> p_user) then
    raise exception 'ComicTable needs at least one admin.' using errcode = 'P0001';
  end if;
  update platform_admins set role = p_role where user_id = p_user;
end $$;
revoke all on function public.set_platform_role(uuid, text) from public;
grant execute on function public.set_platform_role(uuid, text) to authenticated;

drop policy if exists "super admins delete" on comics;
create policy "super admins delete" on comics for delete to authenticated using (public.is_platform_owner());
do $$ begin
  if to_regclass('public.platform_settings') is not null then
    execute 'drop policy if exists "super admins write" on platform_settings';
    execute 'create policy "super admins write" on platform_settings for all to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner())';
  end if;
end $$;

/* ---------------- keeping every site in step with a comic's Coaster ---------------- */
-- A site's copy of a comic (hosts) follows the comic, except a bio, title or photo the site set for itself.
-- These lived in 11_comics and 19_more_socials; they're here so an older upgrade can't bring back an old copy.
alter table comics add column if not exists socials jsonb not null default '{}'::jsonb;
alter table hosts add column if not exists socials jsonb not null default '{}'::jsonb;
alter table hosts add column if not exists own_photo boolean not null default false;

create or replace function public.comic_to_hosts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update hosts set name = new.name, status = new.status, instagram = new.instagram, youtube = new.youtube,
    tiktok = new.tiktok, twitter = new.twitter, website = new.website, socials = coalesce(new.socials, '{}'::jsonb),
    photo_url = case when own_photo then photo_url else new.photo_url end,
    bio = case when own_bio then bio else new.bio end, title = case when own_title then title else new.title end
  where comic_id = new.id;
  return new;
end $$;
drop trigger if exists comics_sync on comics;
create trigger comics_sync after update on comics for each row execute function public.comic_to_hosts();

create or replace function public.host_from_comic() returns trigger language plpgsql set search_path = public as $$
declare c record;
begin
  if new.comic_id is null then return new; end if;
  select * into c from comics where id = new.comic_id;
  if not found then return new; end if;
  new.name := c.name; new.status := c.status; new.instagram := c.instagram; new.youtube := c.youtube;
  new.tiktok := c.tiktok; new.twitter := c.twitter; new.website := c.website; new.socials := coalesce(c.socials, '{}'::jsonb);
  if not new.own_photo then new.photo_url := c.photo_url; end if;
  if not new.own_bio then new.bio := c.bio; end if;
  if not new.own_title then new.title := c.title; end if;
  return new;
end $$;
drop trigger if exists hosts_from_comic on hosts;
create trigger hosts_from_comic before insert or update of comic_id, own_bio, own_title, own_photo on hosts
  for each row execute function public.host_from_comic();

/* ---------------- putting a comic with their own login on a site ---------------- */
-- A comic who has claimed their Coaster (has a login) says yes before a site can add them.
-- No ask needed: the comic adding themselves, ComicTable admins, and the server (no login).
do $$ begin
  if to_regclass('public.coaster_requests') is not null then
    execute 'drop policy if exists "see requests" on coaster_requests';
    execute $p$create policy "see requests" on coaster_requests for select to authenticated using (
      requested_by = auth.uid() or public.is_site_admin(site_id) or public.is_platform_admin()
      or exists (select 1 from comics c where c.id = comic_id and c.user_id = auth.uid()))$p$;
    execute 'drop policy if exists "ask" on coaster_requests';
    execute $p$create policy "ask" on coaster_requests for insert to authenticated with check (
      requested_by = auth.uid() and status = 'pending' and public.is_site_admin(site_id))$p$;
    execute 'drop policy if exists "take back" on coaster_requests';
    execute $p$create policy "take back" on coaster_requests for delete to authenticated using (
      status = 'pending' and (requested_by = auth.uid() or public.is_site_admin(site_id)))$p$;
  end if;
end $$;

create or replace function public.host_needs_ok() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if new.comic_id is null or auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.comic_id is not distinct from old.comic_id then return new; end if;
  select user_id into owner from comics where id = new.comic_id;
  if owner is null or owner = auth.uid() or public.is_platform_owner() then return new; end if;
  if to_regclass('public.coaster_requests') is not null and exists (
       select 1 from coaster_requests where comic_id = new.comic_id and site_id = new.site_id and status = 'approved') then
    return new;
  end if;
  raise exception 'This comic has their own login. Ask them first: they''ll get a request to say yes.' using errcode = 'P0001';
end $$;
drop trigger if exists hosts_needs_ok on hosts;
create trigger hosts_needs_ok before insert or update of comic_id on hosts for each row execute function public.host_needs_ok();

-- The comic (or a ComicTable admin) answers. Yes puts them on the site, at the end of its lineup.
create or replace function public.answer_coaster_request(p_id uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r record; c record; hid text; n int := 0;
begin
  select * into r from coaster_requests where id = p_id and status = 'pending';
  if not found then raise exception 'That request was already answered.' using errcode = 'P0001'; end if;
  select * into c from comics where id = r.comic_id;
  if not (c.user_id = auth.uid() or public.is_platform_owner()) then
    raise exception 'Only the comic can answer this.' using errcode = '42501';
  end if;
  update coaster_requests set status = case when p_yes then 'approved' else 'declined' end, answered_at = now() where id = p_id;
  if p_yes and not exists (select 1 from hosts where site_id = r.site_id and comic_id = r.comic_id) then
    hid := r.site_id || '-' || coalesce(nullif(public.comic_slug(split_part(c.name, ' ', 1)), 'comic'), 'person');
    while exists (select 1 from hosts where id = hid) loop n := n + 1; hid := hid || '-' || n; end loop;
    insert into hosts (id, site_id, comic_id, name, sort)
      values (hid, r.site_id, r.comic_id, c.name, (select count(*) from hosts where site_id = r.site_id));
  end if;
end $$;
revoke all on function public.answer_coaster_request(uuid, boolean) from public;
grant execute on function public.answer_coaster_request(uuid, boolean) to authenticated;
