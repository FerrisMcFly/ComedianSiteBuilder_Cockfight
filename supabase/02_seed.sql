-- Starting content: everything currently on the site. Run once, after setup.sql.

insert into hosts (id, name, title, bio, sort, instagram, youtube, website) values
  ('colum', 'Colum Tyrrell', 'Comedian', 'Stand-up comedian and co-host of Cockfight. Colum is on the road right now. Tour dates and ticket links are below.', 0, 'https://www.instagram.com/columtyrrell', 'https://www.youtube.com/@ColumTyrrell', 'https://linktr.ee/columtyrrell'),
  ('lev', 'Lev Fer', 'Comedian', 'Stand-up comedian and co-host of Cockfight. New tour dates will show up here when they''re announced.', 1, 'https://www.instagram.com/levfer', 'https://www.youtube.com/@LevFerOfficial', 'https://linktr.ee/levfer'),
  ('tristan', 'Tristan Bowling', 'Comedian', 'Stand-up comedian and co-host of Cockfight. Hear the story in Episode 82, "Madison Square Tristan." New tour dates will show up here when they''re announced.', 2, 'https://www.instagram.com/tristanisacomedian', 'https://www.youtube.com/@tristanbowling2927', 'https://linktr.ee/tristanbowling');

insert into shows (host, date, time, city, venue, url) values
  ('colum', '2026-11-05', '7:30 PM', 'Charlotte, NC', 'The Comedy Club at Duckworth''s', 'https://comedy.tickets/event/colum-tyrrell-charlotte-the-comedy-club-at-duckworths-thursday-november-5-2026-7-30-pm/?pid=3568'),
  ('colum', '2026-11-06', '7:00 PM', 'Charlotte, NC', 'The Comedy Club at Duckworth''s', 'https://comedy.tickets/event/colum-tyrrell-charlotte-the-comedy-club-at-duckworths-friday-november-6-2026-7-00-pm/?pid=3568'),
  ('colum', '2026-11-06', '9:30 PM', 'Charlotte, NC', 'The Comedy Club at Duckworth''s', 'https://comedy.tickets/event/colum-tyrrell-charlotte-the-comedy-club-at-duckworths-friday-november-6-2026-9-30-pm/?pid=3568'),
  ('colum', '2026-11-07', '6:00 PM', 'Charlotte, NC', 'The Comedy Club at Duckworth''s', 'https://comedy.tickets/event/colum-tyrrell-charlotte-the-comedy-club-at-duckworths-saturday-november-7-2026-6-00-pm/?pid=3568'),
  ('colum', '2026-11-07', '8:30 PM', 'Charlotte, NC', 'The Comedy Club at Duckworth''s', 'https://comedy.tickets/event/colum-tyrrell-charlotte-the-comedy-club-at-duckworths-saturday-november-7-2026-8-30-pm/?pid=3568'),
  ('colum', '2027-01-24', '6:00 PM', 'Boston, MA', 'Laugh Boston', 'https://comedy.tickets/event/colum-tyrrell-boston-laugh-boston-sunday-january-24-2027-6-00-pm/?pid=3568');

insert into episodes (num, title, posted, length, url, patreon, blurb) values
  (91, 'Marathon Chainsaw', '2026-10-22', '1h 20m', 'https://podtail.com/en/podcast/cockfight-1/marathon-chainsaw-e91/', 'p2', null),
  (90, 'Shane Gillis, Kill Tony, Dane Cook (Part 2)', '2026-10-15', '1h 9m', 'https://podtail.com/en/podcast/cockfight-1/shane-gillis-kill-tony-dane-cook-e90-part-2/', 'p1', null),
  (89, 'Goodyear Celebration', '2026-10-08', '1h 13m', 'https://podtail.com/en/podcast/cockfight-1/goodyear-celebration-e89/', 'p2', null),
  (88, 'Rogan Paul', '2026-10-01', '1h 9m', 'https://podtail.com/en/podcast/cockfight-1/rogan-paul-e88/', 'p2', null),
  (87, 'Bedtime Channing', '2026-09-24', '1h 12m', 'https://podtail.com/en/podcast/cockfight-1/bedtime-channing-e87/', 'p2', null),
  (86, 'Hacklemore', '2026-09-17', '1h 8m', 'https://podtail.com/en/podcast/cockfight-1/hacklemore-e86/', 'p2', null),
  (85, 'Collie Parton', '2026-09-10', '1h 15m', 'https://podtail.com/en/podcast/cockfight-1/collie-parton-e85/', 'p2', null),
  (84, 'Lev vs. Cumtown (Part 2)', '2026-09-03', '1h 5m', 'https://podtail.com/en/podcast/cockfight-1/lev-vs-cumtown-e84-part-2/', 'p1', null),
  (83, 'Colum is Chinese', '2026-08-27', '1h 3m', 'https://podtail.com/en/podcast/cockfight-1/colum-is-chinese-e83/', 'p2', null),
  (82, 'Madison Square Tristan', '2026-08-20', '1h 8m', 'https://podcasts.apple.com/us/podcast/madison-square-tristan-e82/id1792746019?i=1000784598470', 'p2', null),
  (81, 'Evil Hollywood Agent', '2026-08-13', '1h 6m', 'https://podcasts.apple.com/us/podcast/evil-hollywood-agent-e81/id1792746019?i=1000783142818', null, null),
  (80, 'Patrice O''Neal''s Hat (Part 2)', '2026-08-06', '1h 3m', 'https://podcasts.apple.com/us/podcast/patrice-oneals-hat-e80-part-2/id1792746019?i=1000780248770', null, null),
  (79, 'The Prophecy', '2026-07-30', '1h 12m', 'https://podcasts.apple.com/us/podcast/the-prophecy-e79/id1792746019?i=1000779114852', null, null),
  (78, 'Why Tristan Quit Skanks', '2026-07-23', '1h 5m', 'https://podcasts.apple.com/us/podcast/why-tristan-quit-skanks-e78/id1792746019?i=1000778033227', null, null),
  (77, 'Kool-Aid Man', '2026-07-16', '52m', 'https://podcasts.apple.com/us/podcast/kool-aid-man-e77/id1792746019?i=1000777061932', null, null),
  (76, 'David Goggles', '2026-07-09', '1h 20m', 'https://podcasts.apple.com/us/podcast/david-goggles-e76/id1792746019?i=1000776120906', null, null),
  (75, 'Schizophrenic Letterboxd', '2026-07-02', '1h 5m', 'https://podcasts.apple.com/us/podcast/schizophrenic-letterboxd-e75/id1792746019?i=1000775176520', null, null),
  (74, 'Bungee Dumping', '2026-06-25', null, 'https://podtail.com/en/podcast/cockfight-1/bungee-dumping-e74/', null, null),
  (73, 'The Knicks Fight', '2026-06-18', null, 'https://podtail.com/en/podcast/cockfight-1/the-knicks-fight-e73/', null, null),
  (72, 'Rhino-Saurus', '2026-06-12', null, 'https://podtail.com/en/podcast/cockfight-1/rhino-saurus-e72/', null, null),
  (71, 'Larger Than Assessed', '2026-06-04', null, null, null, null),
  (70, 'Youtube Ban', '2026-05-28', null, null, null, null),
  (69, 'Pantsless', '2026-05-21', null, null, null, null),
  (68, 'Chode The Builder', '2026-05-14', null, null, null, null),
  (67, 'Optimus Crime', '2026-05-07', null, null, null, null),
  (66, 'Our Response to Ari Shaffir!', '2026-04-30', null, null, null, null),
  (65, 'Our Response to Dave Smith', '2026-04-23', null, null, null, null),
  (64, 'Racist Seinfeld', '2026-04-16', null, null, null, null),
  (63, 'Tristan and the Giant Peach (Part 2)', '2026-04-09', null, null, null, null),
  (62, 'Christopher Tomato', '2026-04-02', null, null, null, null),
  (61, 'Trial By Combat', '2026-03-26', null, null, null, null),
  (60, 'Curtain Metzger', '2026-03-19', null, null, null, null),
  (59, 'New Legion Of Skanks Host?', '2026-03-12', null, null, null, null),
  (58, 'Kristi NoemlyFans', '2026-03-06', null, null, null, null),
  (57, 'Open Mic Batman', '2026-02-26', null, null, null, null),
  (56, 'Scissors Creek', '2026-02-19', null, null, null, null),
  (55, 'The Cold Olympics', '2026-02-12', null, null, null, null),
  (54, 'The List', '2026-02-05', null, null, null, null),
  (53, 'Hugh Miliation', '2026-01-29', null, null, null, null),
  (52, 'Riff City', '2026-01-22', null, null, null, null),
  (51, 'Ladymen', '2026-01-15', null, null, null, null),
  (50, 'The Stool Act', '2026-01-08', null, null, null, null),
  (49, 'Lev''s Big Fat Musical', '2026-01-01', null, null, null, null),
  (48, '12 Gays of Christmas', '2025-12-25', null, null, null, null),
  (47, 'Mumbai in the Sky', '2025-12-18', null, null, null, null),
  (46, 'The Retahded', '2025-12-11', null, null, null, null),
  (45, 'A New Beginning', '2025-12-04', null, null, null, null);

insert into settings (key, value) values
  ('marquee', '¡¡¡ NEW EPISODE 91: MARATHON CHAINSAW — OUT NOW !!! ••• PART 2 ON PATREON ••• COLUM LIVE IN CHARLOTTE NOV 5–7 ••• COLUM AT LAUGH BOSTON JAN 24 ••• SUPPORT THE SHOW ON PATREON ••• SIGN UP FOR THE FORUMS ••• THANK YOU FOR VISITING •••'),
  ('headline', 'Episode 91, "Marathon Chainsaw," is out now. Part 2 is on Patreon.');
