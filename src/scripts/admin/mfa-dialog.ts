/**
 * Zweiter Faktor — die Oberfläche.
 *
 * Erreichbar über "Seguridad" in der Kopfzeile (verdrahtet in main.ts).
 * Zeigt je nach Lage entweder den QR-Code zum Einrichten oder den
 * bestehenden Faktor mit der Möglichkeit, ihn wieder zu entfernen.
 *
 * Getrennt von mfa.ts, damit `auth.ts` und `dialog.ts` die reine Prüflogik
 * benutzen können, ohne sich die Oberfläche und damit einen Import-Zyklus
 * einzufangen.
 *
 * Optik: `.adm-mfa*` in src/styles/admin/base.css.
 */
import { openDialog } from './dialog';
import {
  activateTotp,
  codeInput,
  enrollTotp,
  mfaState,
  removeFactor,
  type EnrollStart,
} from './mfa';

let seq = 0;

export async function securityDialog(): Promise<boolean> {
  const state = await mfaState();
  const id = `adm-mfa-${++seq}`;

  return openDialog((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'adm-dialog adm-dialog--mfa';

    const title = document.createElement('h2');
    title.className = 'adm-dialog__title';
    title.id = id;

    const body = document.createElement('div');
    body.className = 'adm-mfa__body';

    const errorEl = document.createElement('p');
    errorEl.className = 'adm-error';
    errorEl.hidden = true;

    const actions = document.createElement('div');
    actions.className = 'adm-dialog__actions';

    dialog.append(title, body, errorEl, actions);

    const fail = (message: string): void => {
      errorEl.textContent = message;
      errorEl.hidden = false;
    };

    function paragraph(text: string): HTMLParagraphElement {
      const p = document.createElement('p');
      p.className = 'adm-dialog__body';
      p.textContent = text;
      return p;
    }

    function button(label: string, ghost = false): HTMLButtonElement {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = ghost ? 'btn btn--ghost' : 'btn';
      btn.textContent = label;
      return btn;
    }

    /** Bereits eingerichtet: anzeigen und das Entfernen anbieten. */
    function showEnrolled(factorId: string): void {
      title.textContent = 'Segundo factor activo';
      body.replaceChildren(
        paragraph(
          'Tu cuenta pide un código además de la contraseña. Si cambiás de ' +
            'teléfono, quitá el factor acá y configuralo de nuevo con el ' +
            'teléfono nuevo antes de deshacerte del viejo.',
        ),
      );

      const remove = button('Quitar segundo factor', true);
      remove.addEventListener('click', () => {
        void (async () => {
          remove.disabled = true;
          errorEl.hidden = true;
          try {
            await removeFactor(factorId);
            resolve(true);
          } catch (err) {
            fail(err instanceof Error ? err.message : 'No se pudo quitar.');
            remove.disabled = false;
          }
        })();
      });

      const close = button('Listo');
      close.addEventListener('click', () => resolve(true));

      actions.replaceChildren(remove, close);
    }

    /** Noch nichts eingerichtet. */
    function showEnroll(): void {
      title.textContent = 'Activar segundo factor';
      body.replaceChildren(
        paragraph(
          'Con esto, quien tenga tu contraseña todavía no puede entrar. ' +
            'Necesitás una app de códigos en el teléfono (Google ' +
            'Authenticator, Aegis, 1Password o la que ya uses).',
        ),
      );

      const cancel = button('Ahora no', true);
      cancel.addEventListener('click', () => resolve(false));

      const start = button('Empezar');
      start.addEventListener('click', () => {
        void (async () => {
          start.disabled = true;
          errorEl.hidden = true;
          try {
            showQr(await enrollTotp());
          } catch (err) {
            fail(err instanceof Error ? err.message : 'No se pudo empezar.');
            start.disabled = false;
          }
        })();
      });

      actions.replaceChildren(cancel, start);
    }

    function showQr(enrollment: EnrollStart): void {
      const step = paragraph(
        'Escaneá este código con la app y escribí abajo el número que te muestra.',
      );

      // Als <img> mit data-URI statt innerHTML: das SVG kommt zwar von
      // Supabase, aber fremdes Markup gehört nicht ungeprüft in den DOM --
      // und ein <img> kann keine Skripte ausführen.
      const qr = document.createElement('img');
      qr.className = 'adm-mfa__qr';
      qr.alt = 'Código QR para la app de autenticación';
      qr.src = `data:image/svg+xml;utf-8,${encodeURIComponent(enrollment.qrSvg)}`;

      const secretWrap = document.createElement('details');
      secretWrap.className = 'adm-mfa__secret';
      const summary = document.createElement('summary');
      summary.textContent = 'La cámara no anda / escribir la clave a mano';
      const secret = document.createElement('code');
      secret.textContent = enrollment.secret;
      secretWrap.append(summary, secret);

      const field = document.createElement('div');
      field.className = 'adm-field';
      const label = document.createElement('label');
      label.className = 'adm-label';
      label.htmlFor = `${id}-code`;
      label.textContent = 'Código de la app';
      const input = codeInput(`${id}-code`);
      field.append(label, input);

      body.replaceChildren(step, qr, secretWrap, field);

      const cancel = button('Cancelar', true);
      cancel.addEventListener('click', () => resolve(false));

      const confirm = button('Activar');
      const submit = (): void => {
        void (async () => {
          confirm.disabled = true;
          errorEl.hidden = true;
          try {
            await activateTotp(enrollment.factorId, input.value);
            showDone();
          } catch (err) {
            fail(err instanceof Error ? err.message : 'No se pudo activar.');
            confirm.disabled = false;
            input.select();
          }
        })();
      };

      confirm.addEventListener('click', submit);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });

      actions.replaceChildren(cancel, confirm);
      input.focus();
    }

    function showDone(): void {
      title.textContent = 'Listo';
      errorEl.hidden = true;
      body.replaceChildren(
        paragraph(
          'A partir de ahora el panel te va a pedir el código además de la ' +
            'contraseña. Guardá la app en un lugar seguro: sin ella no se entra.',
        ),
      );

      const close = button('Entendido');
      close.addEventListener('click', () => resolve(true));
      actions.replaceChildren(close);
      close.focus();
    }

    if (state.enrolled && state.factorId) showEnrolled(state.factorId);
    else showEnroll();

    return {
      dialog,
      labelledBy: id,
      closeOnBackdrop: true,
      initialFocus: () => actions.querySelector<HTMLElement>('.btn:last-child'),
    };
  });
}
