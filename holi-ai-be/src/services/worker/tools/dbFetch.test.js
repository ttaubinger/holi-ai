/* eslint-disable max-lines-per-function */

const dbFetch = require('./dbFetch');
const database = require('../../db');

jest.mock('../../db');

describe('dbFetch.js', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('minifyObject', () => {
    it('minifies objects by removing internal fields', async () => {
      database.fetchBiometricsLogs.mockResolvedValue([
        { id: '1', user_id: 'u', updated_at: 'now', value: 10 },
        { logged_at: '2023-01-01T12:00:00Z', test: null, nested: { id: 'x', a: 1 } }
      ]);
      const res = await dbFetch.handleFetchBiometricsLogs({}, 'u', { days: 3 });
      expect(res).toEqual([{ value: 10 }, { logged_at: '2023-01-01', nested: { a: 1 } }]);
    });
  });

  describe('handleFetchActionPlans', () => {
    it('returns array of plan titles', async () => {
      database.fetchActionModules.mockResolvedValue([{ module_title: 'Plan A' }, { module_title: 'Plan B' }]);
      const res = await dbFetch.handleFetchActionPlans({}, 'u');
      expect(res).toEqual(['Plan A', 'Plan B']);
    });
  });

  describe('handleFetchActionPlanCategories', () => {
    it('returns category names for a matching plan', async () => {
      database.fetchActionModules.mockResolvedValue([{ module_title: 'Plan A', categories: [{ name: 'Cat1' }] }]);
      const res = await dbFetch.handleFetchActionPlanCategories({}, 'u', { plan_title: 'Plan A' });
      expect(res).toEqual(['Cat1']);
    });

    it('returns empty array if no categories', async () => {
      database.fetchActionModules.mockResolvedValue([{ module_title: 'Plan A' }]);
      const res = await dbFetch.handleFetchActionPlanCategories({}, 'u', { plan_title: 'Plan A' });
      expect(res).toEqual([]);
    });

    it('returns error if plan not found', async () => {
      database.fetchActionModules.mockResolvedValue([]);
      const res = await dbFetch.handleFetchActionPlanCategories({}, 'u', { plan_title: 'Plan A' });
      expect(res).toEqual({ error: 'Plan not found: Plan A' });
    });
  });

  describe('handleFetchActionPlanCategory', () => {
    it('returns category content for matching plan and category', async () => {
      database.fetchActionModules.mockResolvedValue([{ 
        module_title: 'Plan A', 
        categories: [{ name: 'Cat1', content: 'abc' }] 
      }]);
      const res = await dbFetch.handleFetchActionPlanCategory({}, 'u', { plan_title: 'Plan A', category_name: 'Cat1' });
      expect(res).toEqual({ name: 'Cat1', content: 'abc' });
    });

    it('returns error if plan not found', async () => {
      database.fetchActionModules.mockResolvedValue([]);
      const res = await dbFetch.handleFetchActionPlanCategory({}, 'u', { plan_title: 'Plan A', category_name: 'Cat1' });
      expect(res).toEqual({ error: 'Plan not found: Plan A' });
    });

    it('returns error if category not found', async () => {
      database.fetchActionModules.mockResolvedValue([{ module_title: 'Plan A', categories: [] }]);
      const res = await dbFetch.handleFetchActionPlanCategory({}, 'u', { plan_title: 'Plan A', category_name: 'Cat1' });
      expect(res).toEqual({ error: 'Category not found: Cat1 in plan: Plan A' });
    });
  });

  describe('handleFetchUserCrons', () => {
    it('returns minified user crons', async () => {
      database.fetchUserCrons.mockResolvedValue([{ id: '1', title: 'Cron1' }]);
      const res = await dbFetch.handleFetchUserCrons({}, 'u');
      expect(res).toEqual([{ title: 'Cron1' }]);
    });
  });
});
