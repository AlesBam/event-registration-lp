import { CONTACT } from "@/lib/config";

export function ClosedNotice() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-ice sm:p-8" role="status">
      <h3 className="text-2xl font-extrabold text-ink">Registrace uzavřena</h3>
      <p className="mt-3 text-base leading-relaxed text-muted">
        Pokud se chceš ještě přidat, zkus se spojit s {CONTACT.nameWith}:{" "}
        <a
          href={CONTACT.phoneHref}
          className="font-bold whitespace-nowrap text-berry underline underline-offset-4 hover:text-berry-dark focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
        >
          {CONTACT.phoneDisplay}
        </a>
      </p>
    </div>
  );
}
