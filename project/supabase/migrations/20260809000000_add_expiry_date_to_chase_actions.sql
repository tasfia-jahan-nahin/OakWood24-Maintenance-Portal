/*
  Add the document expiry date to chase actions so a Received action
  applies only to the corresponding document version.
*/

ALTER TABLE public.chase_actions
ADD COLUMN IF NOT EXISTS expiry_date date;