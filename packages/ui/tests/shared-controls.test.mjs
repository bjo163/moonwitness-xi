import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Label } from '../dist/components/label.js';
import { Switch } from '../dist/components/switch.js';
import { Textarea } from '../dist/components/textarea.js';

test('shared field controls keep explicit label association, invalid state and switch semantics', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Label, { htmlFor: 'notes', children: 'Notes' }),
      React.createElement(Textarea, {
        id: 'notes',
        'aria-invalid': true,
        'aria-describedby': 'notes-error',
      }),
      React.createElement(Switch, { checked: true, 'aria-label': 'Enable reminders' })
    )
  );

  assert.match(html, /<label[^>]*for="notes"[^>]*>Notes<\/label>/u);
  assert.match(
    html,
    /<textarea[^>]*id="notes"[^>]*aria-invalid="true"[^>]*aria-describedby="notes-error"/u
  );
  assert.match(html, /role="switch"[^>]*aria-checked="true"[^>]*aria-label="Enable reminders"/u);
});
