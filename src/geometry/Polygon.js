import { isNil, isArrayHasData } from 'core/util';
import Coordinate from 'geo/Coordinate';
import { pointInsidePolygon, distanceToSegment } from 'core/util/path';
import Path from './Path';

const JSON_TYPE = 'Polygon';

/**
 * @classdesc
 * Geometry class for polygon type
 * @category geometry
 * @extends Path
 * @example
 * var polygon = new Polygon(
 *      [
 *          [
 *              [121.48053653961283, 31.24244899384889],
 *              [121.48049362426856, 31.238559229494186],
 *              [121.49032123809872, 31.236210614999653],
 *              [121.49366863494917, 31.242926029397037],
 *              [121.48577221160967, 31.243880093267567],
 *              [121.48053653961283, 31.24244899384889]
 *          ]
 *      ]
 *  ).addTo(layer);
 */
class Polygon extends Path {

    /**
     * @param {Number[][]|Number[][][]|Coordinate[]|Coordinate[][]} coordinates - coordinates, shell coordinates or all the rings.
     * @param {Object} [options=null] - construct options defined in [Polygon]{@link Polygon#options}
     */
    constructor(coordinates, opts) {
        super(opts);
        this.type = 'Polygon';
        if (coordinates) {
            this.setCoordinates(coordinates);
        }
    }

    /**
     * Set coordinates to the polygon
     *
     * @param {Number[][]|Number[][][]|Coordinate[]|Coordinate[][]} coordinates - new coordinates
     * @return {Polygon} this
     * @fires Polygon#shapechange
     */
    setCoordinates(coordinates) {
        if (!coordinates) {
            this._coordinates = null;
            this._holes = null;
            this._projectRings();
            return this;
        }
        const rings = Coordinate.toCoordinates(coordinates);
        const len = rings.length;
        if (!Array.isArray(rings[0])) {
            this._coordinates = this._trimRing(rings);
        } else {
            this._coordinates = this._trimRing(rings[0]);
            if (len > 1) {
                const holes = [];
                for (let i = 1; i < len; i++) {
                    if (!rings[i]) {
                        continue;
                    }
                    holes.push(this._trimRing(rings[i]));
                }
                this._holes = holes;
            }
        }

        this._projectRings();
        return this;
    }

    /**
     * Gets polygons's coordinates
     *
     * @returns {Coordinate[][]}
     */
    getCoordinates() {
        if (!this._coordinates) {
            return [];
        }
        const holes = this.getHoles();
        const rings = [this._copyAndCloseRing(this._coordinates)];
        for (let i = 0, l = holes.length; i < l; i++) {
            rings.push(this._copyAndCloseRing(holes[i]));
        }
        return rings;
    }

    /**
     * Gets shell's coordinates of the polygon
     *
     * @returns {Coordinate[]}
     */
    getShell() {
        return this._coordinates || [];
    }


    /**
     * Gets holes' coordinates of the polygon if it has.
     * @returns {Coordinate[][]}
     */
    getHoles() {
        return this._holes || [];
    }

    /**
     * Whether the polygon has any holes inside.
     *
     * @returns {Boolean}
     */
    hasHoles() {
        return this.getHoles().length > 0;
    }

    _projectRings() {
        if (!this.getMap()) {
            this.onShapeChanged();
            return;
        }
        this._prjCoords = this._projectCoords(this._coordinates);
        this._prjHoles = this._projectCoords(this._holes);
        this.onShapeChanged();
    }

    _cleanRing(ring) {
        for (let i = ring.length - 1; i >= 0; i--) {
            if (!ring[i]) {
                ring.splice(i, 1);
            }
        }
    }

    /**
     * Check if ring is valid
     * @param  {*} ring ring to check
     * @return {Boolean} is ring a closed one
     * @private
     */
    _checkRing(ring) {
        this._cleanRing(ring);
        if (!ring || !isArrayHasData(ring)) {
            return false;
        }
        const lastPoint = ring[ring.length - 1];
        let isClose = true;
        if (ring[0].x !== lastPoint.x || ring[0].y !== lastPoint.y) {
            isClose = false;
        }
        return isClose;
    }

    /**
     * If the first coordinate is equal with the last one, then remove the last coordinates.
     * @private
     */
    _trimRing(ring) {
        const isClose = this._checkRing(ring);
        if (isArrayHasData(ring) && isClose) {
            ring.splice(ring.length - 1, 1);
        }
        return ring;
    }

    /**
     * If the first coordinate is different with the last one, then copy the first coordinates and add to the ring.
     * @private
     */
    _copyAndCloseRing(ring) {
        ring = ring.slice(0);
        const isClose = this._checkRing(ring);
        if (isArrayHasData(ring) && !isClose) {
            ring.push(ring[0].copy());
            return ring;
        } else {
            return ring;
        }
    }

    _getPrjShell() {
        if (this.getJSONType() === JSON_TYPE) {
            return this._getPrjCoordinates();
        }
        if (!this._prjShell) {
            this._prjShell = this._projectCoords(this.getShell());
        }
        return this._prjShell;
    }

    _getPrjHoles() {
        if (!this._prjHoles) {
            this._prjHoles = this._projectCoords(this.getHoles());
        }
        return this._prjHoles;
    }

    _computeGeodesicLength(measurer) {
        const rings = this.getCoordinates();
        if (!isArrayHasData(rings)) {
            return 0;
        }
        let result = 0;
        for (let i = 0, len = rings.length; i < len; i++) {
            result += measurer.measureLength(rings[i]);
        }
        return result;
    }

    _computeGeodesicArea(measurer) {
        const rings = this.getCoordinates();
        if (!isArrayHasData(rings)) {
            return 0;
        }
        let result = measurer.measureArea(rings[0]);
        //holes
        for (let i = 1, len = rings.length; i < len; i++) {
            result -= measurer.measureArea(rings[i]);

        }
        return result;
    }

    _containsPoint(point, tolerance) {
        const t = isNil(tolerance) ? this._hitTestTolerance() : tolerance,
            pxExtent = this._getPainter().get2DExtent().expand(t);

        function isContains(points) {
            const c = pointInsidePolygon(point, points);
            if (c) {
                return c;
            }

            let i, j, p1, p2;
            const len = points.length;

            for (i = 0, j = len - 1; i < len; j = i++) {
                p1 = points[i];
                p2 = points[j];

                if (distanceToSegment(point, p1, p2) <= t) {
                    return true;
                }
            }

            return false;
        }

        if (!pxExtent.contains(point)) {
            return false;
        }

        const projection = this.getMap().getProjection();
        const shell = this.getShell().map(c => projection.project(c));

        const points = this._getPath2DPoints(shell),
            isSplitted = Array.isArray(points[0]);
        if (isSplitted) {
            for (let i = 0; i < points.length; i++) {
                if (isContains(points[i])) {
                    return true;
                }
            }
            return false;
        } else {
            return isContains(points);
        }

    }

    _clearCache() {
        delete this._prjShell;
        return super._clearCache();
    }
}

Polygon.registerJSONType(JSON_TYPE);

export default Polygon;
