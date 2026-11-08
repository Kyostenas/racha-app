import { execFileSync } from 'node:child_process';
const log = execFileSync(
  'git',
  ['log', '--format=%an%x00%ae%x00%cn%x00%ce%x00%(trailers)%x00%B%x00END'],
  { encoding: 'utf8' },
);
for (const entry of log.split('\0END').filter((x) => x.trim())) {
  const [an, ae, cn, ce, trailers, ...body] = entry.trim().split('\0');
  if (
    an !== 'Yael Benjamín Ramírez Estrada' ||
    cn !== an ||
    ae !== '57164866+Kyostenas@users.noreply.github.com' ||
    ce !== ae ||
    trailers.trim() ||
    /Co-authored-by:|Signed-off-by:/i.test(body.join(' '))
  )
    throw new Error('Identidad o trailers no permitidos.');
}
console.log('Identidad de autor/committer y ausencia de trailers verificadas.');
