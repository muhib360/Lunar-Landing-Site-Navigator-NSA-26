// A short guided tour for first-time visitors. Each step can move the app (pick a site, stand on
// the surface, jump in time) so the explanation and the picture happen together.
// Teammates: edit the text freely; keep each step to 2–3 sentences.
import type { ReactNode } from 'react';
import { Term } from './Term.tsx';

export interface TourApi {
  selectSite(id: string): void;
  setCamera(mode: 'orbit' | 'surface'): void;
  setDay(day: number): void;
  play(on: boolean): void;
  overview(): void;
}

interface Step {
  title: string;
  body: ReactNode;
  run?: (api: TourApi) => void;
}

export const STEPS: Step[] = [
  {
    title: 'Where can we land on the Moon?',
    body: (
      <>
        A lander needs two things: <b>sunlight</b> for its solar panels and a view of <b>Earth</b> to talk to home. This
        app shows both for any place and date on the Moon.
      </>
    ),
    run: (a) => {
      a.play(false);
      a.overview();
    },
  },
  {
    title: 'Why everyone wants the south pole',
    body: (
      <>
        The <Term id="southPole">south pole</Term> has craters that never see the Sun and may hold water ice — and
        nearby ridges that are lit almost all the time. NASA’s Artemis astronauts are headed here.
      </>
    ),
    run: (a) => {
      a.selectSite('im2');
      a.setCamera('orbit');
    },
  },
  {
    title: 'The Sun never climbs high',
    body: (
      <>
        We are now standing where the IM-2 lander touched down in 2025. Near the pole the Sun just circles low around the{' '}
        <Term id="horizon">horizon</Term> — a few degrees up at most. Drag to look around.
      </>
    ),
    run: (a) => {
      a.setDay(16);
      a.setCamera('surface');
    },
  },
  {
    title: 'Mountains steal the sunlight',
    body: (
      <>
        Watch the gold strip in the time bar: when the Sun slips behind a distant mountain, the panels go dark — even
        though it is still “daytime”. Moving a few kilometres can change everything.
      </>
    ),
    run: (a) => {
      a.setDay(12);
      a.play(true);
    },
  },
  {
    title: 'Earth wobbles too',
    body: (
      <>
        Earth hangs almost still in the lunar sky, but <Term id="libration">libration</Term> makes it bob up and down.
        At the pole it sits right on the horizon, so ridges can cut off the radio link for days.
      </>
    ),
    run: (a) => a.play(true),
  },
  {
    title: 'Your turn',
    body: (
      <>
        Pick any site or click on the Moon, change the date, and read the answer card. Use <b>Compare</b> to put sites
        or dates side by side, and <b>Expert</b> for the full numbers.
      </>
    ),
    run: (a) => {
      a.play(false);
      a.setCamera('orbit');
    },
  },
];

interface Props {
  step: number;
  onStep: (n: number | null) => void;
}

export function Tour({ step, onStep }: Props) {
  const s = STEPS[step];
  return (
    <div className="tour glass" role="dialog" aria-label="Guided tour">
      <div className="tour-progress">
        {STEPS.map((_, i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      <h3>{s.title}</h3>
      <p>{s.body}</p>
      <div className="tour-actions">
        <button className="link" onClick={() => onStep(null)}>
          Skip tour
        </button>
        <span>
          {step > 0 && (
            <button className="btn" onClick={() => onStep(step - 1)}>
              Back
            </button>
          )}
          <button className="btn primary" onClick={() => onStep(step + 1 < STEPS.length ? step + 1 : null)}>
            {step + 1 < STEPS.length ? 'Next' : 'Start exploring'}
          </button>
        </span>
      </div>
    </div>
  );
}
