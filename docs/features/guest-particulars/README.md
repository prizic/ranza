# Guest particulars

A Guest's date of birth, studies, guardian and emergency contact (slice 1, RANZ-110) and the
identity document they register with (slice 2, RANZ-81). The rows are `edge-cases.csv`, the
diagram is `use-case.mmd`, the reasoning for the table and its permission is
[ADR 0058](../../adr/0058-a-guests-particulars-are-read-by-permission-apart-from-the-guest.md).

## Decisions taken while designing slice 2

Taken without the owner in the loop, each on its recommended answer. Every row is `proposed`.

1. **Full or masked for those who may read it?** Masked: the kind and the last four characters on
   the registration, the whole number on one press that is recorded in the audit log.
   _Why:_ a T.C. kimlik number is the key to a person's whole public record, and many of these
   students are minors (KVKK). The desk rarely needs the number itself; to check a card against the
   screen four characters are enough, and when it does need it, one press is a small price for a log
   that answers "who looked at this?". The simpler design is the number in full to anyone who may open
   the profile, which is how Mews, Cloudbeds and Opera Cloud are generally understood to behave;
   that comparison is from memory, not checked for this note, and it carries no weight here. The mask is a database boundary, not
   a screen courtesy: the runtime role is not granted the column (PA-S2-06).
2. **Which permission?** The same, `guests.read_particulars`. _Why:_ ADR 0058's argument applies
   word for word, and a second permission is one more thing an Organization can set up wrongly.
   Splitting it is a change to a role's grants, not to this design.
3. **A new table or columns on `guest_particulars`?** Columns. _Why:_ one row policy, one reader, one
   writer; a second table would be a second policy that could drift from the first.
4. **Which kinds of document?** T.C. kimlik, passport, residence permit (ikamet), other, as the brief
   gave them. A foreign national identity card is "other". _Why:_ a number is only checkable when its
   kind is known, and only the T.C. kimlik has a checksum worth enforcing.
5. **Is the nationality a list or free text?** A searchable list of ISO 3166-1 codes plus Kosovo
   (XK), named from the browser's locale data in Turkish, English and Arabic. _Why:_ a code is what
   an authority's form takes, and `Intl.DisplayNames` removes 750 translations we would otherwise
   keep true. Typing "turkey" finds Türkiye, which the locale data no longer carries.
6. **Should the nationality choose the kind of document?** It suggests one, until the desk has chosen
   by hand: a Turkish national gets T.C. kimlik, anybody else a passport. _Why:_ one press fewer in
   the common case, and a suggestion that never overrides a choice records nothing the desk did not
   pick. The nationality alone is never recorded as a document.
7. **A kind without a number, or a number without a kind?** The first is nothing typed, the second
   is refused by name. _Why:_ the kind is a radio group that cannot be cleared, so refusing a lone
   kind would make a desk that changed its mind unable to submit.
8. **Where is the number validated?** In three places that restate one rule and are tested against
   each other: the form as it is typed, the module before the statement, the table as the boundary.
   _Why:_ a desk should be told which field to fix, and a constraint name is not that (ADR 0007
   keeps the form from importing the module, so it restates).
9. **KBS submission.** Out of scope; `PA-DEF-05`. _Why:_ it depends on counsel's reading of who is
   obliged and of what is sent for a minor (RANZ-104).

## Open facts

- Whether Organizations want the document **required** for some stays (a Property that must notify
  the authorities). ADR 0057 forbids the operating model making a field required; a per-Property
  requirement is a configuration decision for the owner, like `PA-DEF-03`.
