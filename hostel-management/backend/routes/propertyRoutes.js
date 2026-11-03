/**
 * /api/buildings, /api/floors, /api/rooms
 */
const express = require('express');
const buildings = require('../controllers/buildingController');
const rooms = require('../controllers/roomController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate, validateId, listQuery } = require('../utils/validator');
const { ROOM_TYPES } = require('../utils/constants');

const STATUS = { type: 'string', enum: ['active', 'inactive'], default: 'active' };

// ---- Buildings
const buildingRouter = express.Router();
buildingRouter.use(authenticate);
const buildingSchema = {
  name: { type: 'string', required: true, max: 100 },
  code: { type: 'string', max: 30 },
  description: { type: 'string', max: 255 },
  status: STATUS,
};
buildingRouter.get('/', validate(listQuery({ status: { type: 'string' } }), 'query'), buildings.listBuildings);
buildingRouter.post('/', requirePermission('buildings.manage'), validate({ hostel_id: { type: 'id', required: true }, ...buildingSchema }), buildings.createBuilding);
buildingRouter.put('/:id', requirePermission('buildings.manage'), validateId(), validate(buildingSchema), buildings.updateBuilding);
buildingRouter.delete('/:id', requirePermission('buildings.manage'), validateId(), buildings.deleteBuilding);

// ---- Floors
const floorRouter = express.Router();
floorRouter.use(authenticate);
const floorSchema = {
  floor_number: { type: 'int', required: true, min: -5, max: 200 },
  name: { type: 'string', required: true, max: 60 },
  status: STATUS,
};
floorRouter.get('/', validate(listQuery({ building_id: { type: 'id' }, status: { type: 'string' }, limit: { type: 'int', min: 1, max: 500, default: 100 } }), 'query'), buildings.listFloors);
floorRouter.post('/', requirePermission('buildings.manage'), validate({ building_id: { type: 'id', required: true }, ...floorSchema }), buildings.createFloor);
floorRouter.put('/:id', requirePermission('buildings.manage'), validateId(), validate(floorSchema), buildings.updateFloor);
floorRouter.delete('/:id', requirePermission('buildings.manage'), validateId(), buildings.deleteFloor);

// ---- Rooms
const roomRouter = express.Router();
roomRouter.use(authenticate);
const roomSchema = {
  floor_id: { type: 'id', required: true },
  room_number: { type: 'string', required: true, max: 20 },
  room_type: { type: 'string', required: true, enum: ROOM_TYPES },
  total_beds: { type: 'int', required: true, min: 1, max: 100 },
  monthly_rent: { type: 'money', required: true },
  security_deposit: { type: 'money', default: 0 },
  facilities: { type: 'string', max: 500 },
  status: { type: 'string', enum: ['available', 'maintenance', 'inactive'], default: 'available' },
};
roomRouter.get(
  '/',
  validate(listQuery({
    building_id: { type: 'id' }, floor_id: { type: 'id' }, status: { type: 'string' }, room_type: { type: 'string' },
    availability: { type: 'string' }, limit: { type: 'int', min: 1, max: 500, default: 20 },
  }), 'query'),
  rooms.list
);
roomRouter.get('/available', validate({ hostel_id: { type: 'id' } }, 'query'), rooms.available);
roomRouter.get('/:id', validateId(), rooms.get);
roomRouter.post('/', requirePermission('rooms.manage'), validate(roomSchema), rooms.create);
roomRouter.put('/:id', requirePermission('rooms.manage'), validateId(), validate(roomSchema), rooms.update);
roomRouter.patch('/:id/status', requirePermission('rooms.manage'), validateId(), validate({ status: { type: 'string', required: true, enum: ['active', 'maintenance', 'inactive'] } }), rooms.updateStatus);
roomRouter.delete('/:id', requirePermission('rooms.manage'), validateId(), rooms.remove);
roomRouter.patch('/:id/beds/:bedId', requirePermission('rooms.manage'), validateId('id', 'bedId'), validate({ status: { type: 'string', required: true, enum: ['available', 'maintenance'] } }), rooms.updateBed);

module.exports = { buildingRouter, floorRouter, roomRouter };
