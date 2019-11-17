import { Request, Response } from "express";


export interface MyRequest extends Request {
    id: string;
    log: Function;
    params: any;
}