import { expect, Page } from '@playwright/test';

export async function crearCuentaSiAparece(page: Page): Promise<string | null> {
  const crear = page.getByRole('heading', { name: 'Crea tu cuenta' });
  if (!(await crear.isVisible().catch(() => false))) return null;
  const alias = 't' + Math.random().toString(36).slice(2, 10);
  await page.getByLabel('Alias').fill(alias);
  await page.getByLabel('Contraseña', { exact: true }).fill('secreto12');
  await page.getByLabel('Confirmo que tengo 18 años o más.').check();
  await page.getByLabel(/Acepto los términos/).check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Elige tu objetivo' })).toBeVisible();
  return alias;
}
