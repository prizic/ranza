-- Public RPCs are the customer boundary. Their private implementations are
-- deliberately not executable by customer roles, so wrappers must cross the
-- schema boundary as a definer while retaining the private authorization
-- checks and the caller's auth.uid() request context.
alter function public.publish_meal_day(uuid, uuid, date, timestamptz, text[])
  security definer;
alter function public.submit_meal_response(uuid, text[])
  security definer;

alter function public.post_balance_entry(uuid, uuid, uuid, text, text, numeric, date, date, text, text)
  security definer;
alter function public.reverse_balance_entry(uuid, text, text)
  security definer;

alter function public.request_operator_export(uuid)
  security definer;
alter function public.authorize_operator_export(uuid, uuid)
  security definer;
alter function public.approve_operator_lifecycle_policy(uuid, integer, integer, integer, integer)
  security definer;
alter function public.plan_operator_lifecycle(uuid, text)
  security definer;
alter function public.execute_operator_lifecycle(uuid, uuid, text)
  security definer;
