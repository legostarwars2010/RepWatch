const { resolveDistrict } = require('../services/districts');

test('resolve known ZIP from district_map', () => {
  const res = resolveDistrict({ address: '123 Main St 94203' });
  expect(res).toHaveProperty('state');
  expect(res).toHaveProperty('district');
  expect(res).toHaveProperty('chamber');
});

test('unknown ZIP returns default mapping', () => {
  const res = resolveDistrict({ address: 'No ZIP here' });
  expect(res).toHaveProperty('state');
});
