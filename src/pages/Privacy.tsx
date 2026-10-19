import { Link } from 'react-router-dom';

const CONTACT_EMAIL = 'lennhahn@gmail.com';
const LAST_UPDATED = '19 October 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16 space-y-10">
        <header className="space-y-2">
          <Link to="/marketing" className="text-sm text-muted-foreground hover:text-foreground">
            ← Figtree
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </header>

        <Section title="Who we are">
          <p>
            Figtree (figtreecrm.com) is a lightweight CRM for managing contacts, follow-ups and outreach. Questions about
            this policy or your data: <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section title="What we store">
          <p>
            When you sign in, the CRM data you enter is stored in your account: contacts, notes, tasks, pipeline stages,
            activity history, outreach leads, emails you send or schedule through Figtree, and your settings. Some
            planning tools (projects, resources, product and revenue notes) are stored in your browser and, if you turn
            on cloud backup, in a backup in your account.
          </p>
          <p>
            Your account is identified by your email address, which is used to send you sign-in codes. Data is hosted
            with Supabase in the EU (Frankfurt). Access is restricted so that only you can read your data.
          </p>
        </Section>

        <Section title="Gmail access">
          <p>If you choose to connect Gmail, Figtree asks Google for two permissions:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="text-foreground">Send email on your behalf</span> (gmail.send): to send the emails you
              write or schedule in Figtree to your contacts, and to send you your own reminders and daily digest.
            </li>
            <li>
              <span className="text-foreground">View email metadata</span> (gmail.metadata): to check whether a contact
              replied to an email you sent through Figtree. Figtree only reads the sender and date of messages in those
              threads. It cannot read email bodies or attachments.
            </li>
          </ul>
          <p>
            Figtree stores the Gmail authorization token securely on its server, the address of the connected account,
            and for emails sent through Figtree the message and thread IDs and whether a reply arrived. You can
            disconnect Gmail at any time in Settings, which revokes Figtree's access and deletes the stored token. You
            can also revoke access at{' '}
            <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
              myaccount.google.com/permissions
            </a>
            .
          </p>
          <p>
            Figtree's use and transfer of information received from Google APIs adheres to the{' '}
            <a
              className="underline"
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. Gmail data is used only to provide the features described above.
            It is not sold, not used for advertising, not used to train AI models, and not read by humans except with
            your permission or where required by law.
          </p>
        </Section>

        <Section title="AI drafting">
          <p>
            When you ask Figtree to draft an email, the relevant CRM context for that contact (name, company, stage,
            notes, recent activity and tasks, emails previously sent through Figtree) and the description of your
            business from Settings are sent to Anthropic's Claude API to generate the draft. Data from Gmail is not
            included. Anthropic processes this data to provide the service and does not use API data to train its
            models. Drafts are only sent after you review them.
          </p>
        </Section>

        <Section title="Notifications">
          <p>
            If you turn on push notifications, your browser's push subscription is stored so Figtree can send reminders
            to that device. Notifications are delivered through your browser vendor's push service.
          </p>
        </Section>

        <Section title="Sharing">
          <p>
            Figtree does not sell your data or share it with third parties, except the service providers needed to run
            it: Supabase (hosting and database), Vercel (web hosting), Google (Gmail, if connected) and Anthropic (AI
            drafting, if used).
          </p>
        </Section>

        <Section title="Your choices and deletion">
          <p>
            You can edit or delete your data in the app at any time, export a backup from Settings, and disconnect
            Gmail. To delete your account and all associated data, email{' '}
            <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>
      </div>
    </div>
  );
}
