import fs from 'fs';
import path from 'path';
import { blockchain } from "../startup.mjs";
import ResponseModel from "../utilities/ResponseModel.mjs";
import { reWriteFile, readFromFile, writeToFile } from "../utilities/fileHandler.mjs";
import ErrorRespModel from '../utilities/ErrorResponseModel.mjs';

const folder = 'data';
const file = `blockchain-${process.argv[2]}.json`;
const filePath = path.join(__appdir, folder, file);

// ==================================================================
// Create GENESIS BLOCK and a new BLOCKCHAIN FILE upon initiation
// ==================================================================
if (!fs.existsSync(filePath)) {
    const genesisBlock = blockchain.createBlock([], Date.now(), '0', '0', [], 1337, 2);
    try {
        await writeToFile(folder, file, JSON.stringify([genesisBlock]));
    } catch (error) {
        next(new ErrorRespModel('Unable to create Genesis block', 404));
    }
}

export const getBlockchain = async (req, res, next) => {
    try {
        const chainData = await readFromFile(folder, file);

        if (chainData !== null && chainData.length > 0) {
            res.status(200).json(new ResponseModel({ success: true, statusCode: 200, data: chainData }));
        } else {
            return next(new ErrorRespModel(`No blockchain available`, 404));
        }
    } catch (error) {
        next(error)
    }
}

export const createBlock = async (req, res, next) => {
    try {
        const chain = await readFromFile(folder, file);
        const lastBlock = chain.at(-1);
        const data = req.body;

        const { nonce, difficulty, timestamp } = blockchain.proofOfWork(
            lastBlock,
            lastBlock.currentBlockHash,
            data
        );

        const currentBlockHash = blockchain.hashBlock(
            timestamp,
            lastBlock.currentBlockHash,
            data,
            nonce,
            difficulty
        );

        const block = blockchain.createBlock(
            chain,
            timestamp,
            lastBlock.currentBlockHash,
            currentBlockHash,
            data,
            difficulty
        )

        await writeToFile(folder, file, block);

        res.status(201).json(new ResponseModel({ statusCode: 201, success: true, data: block }));
    } catch (error) {
        next(error);
    }
}

export const getBlockByIndex = async (req, res, next) => {
    try {
        const chainData = await readFromFile(folder, file);
        const block = chainData.find((block) => block.blockIndex === Number(req.params.index));
        if (block) {
            res.status(200).json(new ResponseModel({ success: true, statusCode: 200, data: block }));
        } else {
            return next(new ErrorRespModel(`Unable to find block with index: ${req.params.index}`, 404));
        }
    } catch (error) {
        next(error);
    }
}

export const synchronizeChain = async (reg, res, next) => {
    try {
        const chainData = await readFromFile(folder, file);
        const currentLength = chainData.length;
        let maxLength = currentLength;
        let longestChain = null;

        blockchain.memberNodes.forEach(async (member) => {
            const response = await fetch(`${member}/api/v1/blockchain`);
            if (response.ok) {
                const result = await response.json();

                if (result.data.length > maxLength) {
                    maxLength = result.data.length;
                    longestChain = result.data;
                }

                if (!longestChain && (longestChain && !blockchain.validateChain(longestChain))) {
                    console.log('In sync...');
                } else {
                    console.log('Rewrite blockchain file...');
                    reWriteFile(folder, file, longestChain);
                }

            }

        });

        res.status(200).json(new ResponseModel({
            success: true,
            statusCode: 200,
            data: { message: 'Synchronization completed!' }
        }));
    } catch (error) {
        throw new Error(error);
    }
}